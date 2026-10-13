"""Real local GoTrue/PostgREST/Storage smoke test. Never targets production.
Run after `supabase start` and `supabase migration up --local`.

COPY of the app's tool/backend/smoke.py (agent-uncle, read-only source). Only two lines differ:
the CLI call goes through supabase-local/scripts/sb.sh (pinned 2.120.0, --workdir supabase-local)
and the localhost guard allows this stack's API port 55321 instead of the app stack's 54321.
It creates three synthetic @example.test accounts; run it on a fresh DB, then reset + seed.
"""
import json
import secrets
import subprocess
import urllib.error
import urllib.request

import os
config = json.loads(subprocess.check_output([os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sb.sh'), 'status', '--output', 'json'], stderr=subprocess.DEVNULL))
base = config['API_URL']
assert base in ('http://127.0.0.1:55321', 'http://localhost:55321'), 'Local Supabase only'
key = config['ANON_KEY']

def http(path, data=None, token=None, method=None, raw=False):
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if raw:
        headers['Content-Type'] = 'image/png'
    req = urllib.request.Request(base + path, headers=headers, method=method,
        data=data if raw else json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req, timeout=30) as response:
        body = response.read()
        return body if raw else json.loads(body) if body else None

def signup(role):
    d = http('/auth/v1/signup', {'email': f'saip-{role}-{secrets.token_hex(6)}@example.test', 'password': secrets.token_urlsafe(24)})
    return {'id': d['user']['id'], 'token': d['access_token']}

def call(user, command, args=None, operation=None):
    return http('/rest/v1/rpc/saip_command', {'command': command, 'args': args or {}, 'operation_id': operation or secrets.token_hex(16)}, user['token'])

def snapshot(user):
    return http('/rest/v1/rpc/saip_snapshot', {}, user['token'])

def expect_denied(action):
    try:
        action()
    except urllib.error.HTTPError as error:
        assert error.code in (400, 401, 403), error.code
        return
    raise AssertionError('Expected authorization failure')

retailer, uncle, stranger = signup('retailer'), signup('uncle'), signup('stranger')
# Tiny valid PNG, deliberately no private/user-provided data.
import base64
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5S8AAAAASUVORK5CYII=')
for user, role in [(retailer, 'retailer'), (uncle, 'uncle'), (stranger, 'retailer')]:
    call(user, 'bootstrap')
    call(user, 'chooseRole', {'role': role})
    attachment = secrets.token_hex(16)
    path = user['id'] + '/' + attachment
    http('/storage/v1/object/saip-attachments/' + path, png, user['token'], method='POST', raw=True)
    call(user, 'registerAttachment', {'id': attachment, 'name': 'fixture.png'})
    user['attachment'] = attachment
    user['path'] = path
    values = {'contact': '테스트', 'phone': '01012345678', 'terms': True, 'privacy': True}
    if role == 'retailer':
        values.update({'name': role, 'businessName': '테스트', 'businessNumber': '1234567890', 'documentId': attachment, 'address': '서울', 'addressDetail': '1층', 'salesChannel': '온라인'})
    else:
        values.update({'pickupArea': '동대문', 'deliveryArea': '서울', 'deadline': '23:00'})
    call(user, 'saveProfile', {'complete': True, 'values': values})
code = snapshot(uncle)['accounts'][uncle['id']]['code']
lookup = http('/rest/v1/rpc/saip_lookup_code', {'code': code}, retailer['token'])
assert lookup['id'] == uncle['id'] and 'businessNumber' not in lookup['data']
cid = call(retailer, 'connect', {'peerId': uncle['id'], 'code': code})
call(uncle, 'respondConnection', {'id': cid, 'status': 'accepted', 'version': 0})
request = secrets.token_hex(16)
call(retailer, 'saveDraft', {'id': request, 'values': {'uncleId': uncle['id'], 'wholesaler': '도매', 'location': '2층', 'product': '셔츠', 'option': '검정 M', 'quantity': 2, 'address': '서울', 'addressDetail': '1층', 'photos': [retailer['attachment']]}})
call(retailer, 'sendDraft', {'id': request}, 'send-' + request)
call(retailer, 'sendDraft', {'id': request}, 'send-' + request)
assert snapshot(uncle)['requests'][request]['quantity'] == 2
# Real Storage RLS permits a referenced image but blocks unrelated accounts.
assert http('/storage/v1/object/authenticated/saip-attachments/' + retailer['path'], token=uncle['token'], raw=True) == png
expect_denied(lambda: http('/storage/v1/object/authenticated/saip-attachments/' + retailer['path'], token=stranger['token'], raw=True))
expect_denied(lambda: http('/storage/v1/object/authenticated/saip-attachments/' + uncle['path'], token=retailer['token'], raw=True))
call(uncle, 'act', {'id': request, 'action': 'accept', 'version': 0})
call(uncle, 'act', {'id': request, 'action': 'result', 'version': 1, 'values': {'acquired': 2, 'backorder': 0}})
call(uncle, 'deliver', {'quantities': {request: 2}, 'versions': {request: 2}})
delivery = next(i for i, d in snapshot(retailer)['deliveries'].items() if d['requestId'] == request)
call(retailer, 'receive', {'id': delivery, 'actual': 2, 'reason': '', 'version': 0})
assert snapshot(uncle)['requests'][request]['status'] == 'completed'
assert not snapshot(stranger)['requests']
expect_denied(lambda: http('/rest/v1/saip_records?collection=eq.requests', {'data': {}}, retailer['token'], method='PATCH'))
print('PASS: real Auth sessions, signup, private upload/download, connection, request, acquisition, delivery, receipt, completion, stranger isolation, direct-write denial')
