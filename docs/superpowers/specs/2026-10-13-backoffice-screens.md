# 사입삼춘 Backoffice: Shared UI and Screen Copy Deck (spec appendix)

Companion to `docs/superpowers/specs/2026-10-13-backoffice-design.md` (decisions, architecture, security, data layer). This appendix is the normative source for every screen: routes, columns, filters, views, actions, states and exact Korean copy. Section numbers match the main spec (§9 shared UI, §10 screens).

## 9. Shared UI

**Tokens:**
- Canvas `#EDECE3`, cards and sheets `#F5F4EE`, ink `#101010`, hairline `#D7D7D7`, primary deep green `#0C483E`.
- Weak green `color-mix(#0C483E 12%)`. Attention red `#D22030` on a 12% tint, with text `#B3192A`. Neutral `#E4E3DA`/`#484848`.
- Chart ordinal ramp `#86BC9E #549E7E #2E8C6B #1C6A55 #0C483E`, validated in light mode.
- Paperlogy 400/500/600/700 as full KS X 1001 files, since operators read arbitrary user text.
- Radius 1rem on cards, 0.625rem on controls.
- shadcn preset `radix-mira`, Phosphor icons only.

**Shell:**
- A 4px deep-green rule across the top.
- Left sidebar, grouped and collapsible to icons, with count badges.
- Top bar: breadcrumb, the "계정·요청·화면 찾기 ⌘K" button, the environment pill, the demo toggle (live only), "내 계정".

**Environment pill:**

| Context | Pill |
|---|---|
| local | "로컬 데이터 · 테스트" |
| live, viewer | "운영 DB · 읽기 전용" |
| live, operator or owner | "운영 DB · 변경 가능" (stronger fill) |

**Sidebar** (label, route, minimum role, badge source):

| Group | Items |
|---|---|
| 운영 현황 | 대시보드 `/admin`; 운영 점검 `/admin/checks` (badge: queue critical + high) |
| 계정·관계 | 계정·가입 `/admin/accounts` (badge: accounts.awaitingReview); 거래처 연결 `/admin/connections` |
| 거래 흐름 | 사입 요청 `/admin/requests` (kpi.attention); 전달·수령 `/admin/deliveries` (kpi.deliveriesAwaitingReceipt); 미송 재확인 `/admin/backorders` (kpi.overdueRechecks); 문제·정정 `/admin/issues` (issues.open) |
| 소통 | 채팅 열람 `/admin/chats`; 알림·공지 `/admin/notices` |
| 앱 제어 | 원격 설정 `/admin/remote-config` |
| 웹사이트 | 랜딩 문의 `/admin/leads` (kpi.newLeads) |
| 관리 | 감사 로그 `/admin/audit` (operator); 운영 계정 `/admin/admins` (owner) |
| Footer | 내 계정 `/admin/account`, 로그아웃 |

Items above the user's role are hidden.

**⌘K palette** (cmdk inside a `<Command>` wrapper):
- Groups 계정 / 요청 / 문의 come from `backoffice_search` (debounced 200 ms, at least 1 character).
- The 화면 group lists the nav items.
- Shortcuts: "기한 지난 미송 보기", "수령 대기 48시간 넘음", "서류 확인 대기", "새 랜딩 문의".
- 최근 항목 keeps the last 5 opened items in localStorage, as ids and labels only.
- Placeholder "이름, 매장명, 상품명, 요청 ID로 찾기". Empty: "\"{q}\"에 맞는 결과가 없어요".
- `/admin/search?q=&scope=all|accounts|requests|leads` shows the full result page with scope tabs 전체 / 계정 / 요청 / 문의, highlighted Hangul substrings and "{n}건" counts.

**Data table kit** (TanStack Table v8, server-paginated):
- Sticky header, 48px rows, a bold first line over a muted second line, right-aligned numbers.
- URL state through nuqs: `view, q, page, size, sort, demo` plus module filters. A pasted link reopens the same list.
- A filter bar of removable chips, plus "필터 초기화".
- Facet counts come from the RPC.
- The selection bar reads "{n}건 선택" with "ID 복사" and "선택 해제".
- Footer totals where defined.
- Rows are real links: Enter or click opens the detail.
- Virtualize above 100 rows per page (size 200).

**Status chips** always show icon, label and tint:

| Tone | Icon | Labels |
|---|---|---|
| attention (red) | WarningCircle | 답변 필요, 문제 확인 중, 수량 차이, 재제출 필요, 정보 변경 · 다시 확인 필요, 이용 제한 |
| normal (green) | Clock | 확인 대기, 진행 중, 픽업 완료, 수령 대기, 미송 대기, 미송 재확인, 변경·취소 협의 중, 상대 확인 대기, 조치 완료 · 해결 확인 대기, 수락 대기, 제출됨 · 검증 전 |
| done (green) | CheckCircle | 수령 확인, 연결 완료, 확인함, 확정, 이용 중 |
| ended (grey) | CheckCircle | 완료, 해결 확인 |
| ended (grey) | XCircle | 거절, 취소 종료, 철회, 미등록, 해당 없음 |

The request labels mirror `RequestRecord.statusLabel` verbatim.

**Formats:**
- All times are KST via `@date-fns/tz`, written "10월 13일 02:05" with a relative tooltip ("12시간 전"). The year is added when it is not the current year.
- Durations read "3일째", "5시간째".
- Numbers come first, then the unit: 2장, 3건, 4회차, 5곳, 6명. Bytes read "12.3MB".
- D-day chips read "오늘", "{n}일 지남" (attention) and "{n}일 남음".

**States.** Every list ships three states:
- Loading: skeleton rows matching the column widths.
- Empty: a title and a hint, plus "필터 초기화" when filters are active.
- Error: "목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." plus "다시 시도", keeping the filters.

Forbidden reads "이 화면은 {역할} 이상만 볼 수 있어요.". Loading text always ends with "…".

**Forms:**
- Every write is an `ActionForm` with a hidden `operationId`.
- The pending label reads "저장하는 중…".
- Success shows a toast plus an aria-live message, for example "메모를 남겼어요".
- Failure keeps the input: "저장하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요.", or the DB's own P0001 message.
- Destructive or app-wide actions use an AlertDialog: a question plus one line of consequence.

**Copy rules:**
- 해요체, no exclamation marks, no emoji, no em-dashes. `scripts/qa/no-dash.mjs` applies.
- Use the app's nouns, joined with "·".
- Never call users "고객". Say 소매업자, 사입삼촌 or 계정.
- Business records are never "삭제": "기록은 지우지 않아요.".
- Be honest about limits.

## 10. Screens

Each screen lists its route, minimum role, data source, then content. Copy in quotes is exact.

### 10.1 로그인 `/admin/login` (public)
- Title "사입삼춘 운영". Subtitle "운영 계정으로 로그인해 주세요.".
- Live: button "Google 계정으로 로그인".
- Local: fields "이메일", "비밀번호", button "로그인", note "로컬 테스트 계정만 쓸 수 있어요.".
- Errors:
  - `?error=oauth`: "로그인하지 못했어요. 다시 시도해 주세요."
  - `?reason=expired`: "보안을 위해 다시 로그인해 주세요."
  - Bad password: "이메일 또는 비밀번호를 확인해 주세요."
- Footer: "운영 화면의 열람과 변경은 모두 기록돼요."

### 10.2 2단계 인증 `/admin/mfa`
- Enrolled: "인증 앱의 6자리 코드를 입력해 주세요.", a 6-digit input (`inputMode="numeric"`, `autoComplete="one-time-code"`), "확인". Error: "코드가 맞지 않아요. 새 코드로 다시 입력해 주세요.".
- Not enrolled: "2단계 인증을 등록해 주세요." with three steps:
  - "인증 앱으로 QR 코드를 찍어 주세요"
  - "직접 입력할 키"
  - "앱에 표시된 6자리 코드"
  - Button "등록하고 계속하기".
- Enrolment fails because the project disabled TOTP: "2단계 인증이 아직 켜지지 않았어요. 관리자에게 문의해 주세요.".
- Link "다른 계정으로 로그인".

### 10.3 권한 없음 `/admin/no-access`
- "운영 권한이 없는 계정이에요" / "{email}로 로그인했어요. 관리자에게 이 이메일을 알려 주시면 권한을 받을 수 있어요." Button "로그아웃".
- If `hasAppAccount`: "앱에서 쓰는 계정은 운영 계정으로 쓸 수 없어요. 운영용 Google 계정으로 다시 로그인해 주세요."

### 10.4 사용할 수 없음 `/admin/unavailable`

| Reason | Copy |
|---|---|
| disabled | "이 배포에서는 운영 화면이 꺼져 있어요." |
| not_installed | "운영 데이터 계층이 아직 설치되지 않았어요. 앱 저장소에 마이그레이션이 반영된 뒤 이용할 수 있어요." |
| misconfigured | "운영 화면 설정을 확인해 주세요." |

### 10.5 대시보드 `/admin` (viewer)
- Data: `overview(p_days = range)`.
- Header: "대시보드", range ToggleGroup "오늘 / 7일 / 30일" (`?range=1|7|30`), stamp "{HH:mm} 기준".
- KPI tiles (label, big number and unit, link):

| Tile | Links to |
|---|---|
| 새 사입 요청 {n}건 | `/admin/requests?from=` the period start |
| 확인이 필요한 요청 {n}건 | `/admin/requests?view=attention` (답변 필요 + 문제 확인 중) |
| 기한 지난 미송 재확인 {n}건 | `/admin/backorders?view=due` |
| 수령 대기 {n}회차 | `/admin/deliveries?view=awaiting` |
| 가입 미완료 {n}명 | `/admin/accounts?view=signup` |
| 새 랜딩 문의 {n}건 | `/admin/leads?status=new` |

- "지금 확인할 일" lists the queue, up to 10 items, oldest first within severity. Each row has a reason chip (§10.6 labels), a target summary, a relative age, and the link "열기".
  - Empty: "지금 확인할 일이 없어요" / "새로 생기면 여기에 바로 보여요."
- Charts (dataviz rules: single hue, no legend for single series, axes at 0):
  - "새 사입 요청 · 14일": bars, deep green.
  - "요청 단계": a stacked bar on the ordinal ramp with four stages:
    - 확인 대기
    - 진행 중: 진행 중, 픽업 완료, 미송 대기, 미송 재확인, 답변 필요, 변경·취소 협의 중, 문제 확인 중
    - 수령 대기
    - 완료
  - Plus a grey "종료 {n}건" note (거절 + 취소 종료).
  - "미송 경과": bars "0-1일 / 2-3일 / 4-7일 / 8일 이상".
- Side summary:
  - "소매업자 {n}명 · 사입삼촌 {n}명 · 업무 중 {n}명"
  - "연결 완료 {n}곳 · 수락 대기 {n}건"
  - "채팅 24시간 {n}건"
  - "첨부 {n}개 · {size}"
  - "열린 케이스 {n}건"
  - "게시 중 공지 {n}건"
  - "점검 모드 꺼짐/켜짐", plus "· 쓰기 차단" when blockWrites
- Error: "대시보드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." + "다시 시도".

### 10.6 운영 점검 `/admin/checks` (viewer)
- Data: `ledger_anomalies`.
- Kind chips with counts filter the list. Columns: 중요도 (긴급/높음/보통/낮음), 종류, 대상, 내용, 발생 시각. Rows link to the target.
- Kind labels:

| Kind | Label |
|---|---|
| ledger_violation | 수량 기록 불일치 |
| recheck_overdue | 기한 지난 미송 재확인 |
| receipt_unconfirmed | 수령 확인 48시간 넘음 |
| issue_unresolved | 3일 넘은 문제 |
| pending_request_stale | 하루 넘은 확인 대기 |
| proposal_stale | 이틀 넘은 협의 |
| document_review_pending | 서류 확인 대기 |
| connection_pending_stale | 3일 넘은 연결 요청 |
| signup_stalled | 3일 멈춘 가입 |
| attachment_object_missing | 파일 없음 |
| storage_object_unregistered | 등록되지 않은 파일 |
| auth_user_without_account | 앱 계정 없는 로그인 |
| lead_unhandled | 하루 넘은 새 문의 |

- `ledger_violation` rows show the violation codes in Korean (§10.9) and the note "앱 밖에서 기록이 바뀌었을 수 있어요. 개발팀에 공유해 주세요."
- Empty: "확인할 이상 징후가 없어요" / "수량 기록과 파일 상태가 모두 정상이에요."

### 10.7 계정·가입 `/admin/accounts` (viewer)

**List** (`list_accounts`):
- Views (tabs with counts): 전체 · 가입 미완료 · 서류 확인 대기 · 오늘 가입 · 업무 중인 사입삼촌 · 이용 제한.
- Left facet rail (the only screen with one):
  - 역할: 소매업자 / 사입삼촌 / 역할 선택 전
  - 상태: 가입 미완료 / 가입 완료 / 서류 미등록 / 서류 확인 대기 / 확인함 / 재제출 필요 / 이용 제한 / 로그인 차단 / 운영 계정 / 앱 계정 없음
  - "필터 초기화"
- Search placeholder: viewer "이름·매장명으로 검색"; operator "이름·매장명·이메일·연락처 뒷자리로 검색".
- Sort: 가입일 최신순 / 가입일 오래된순 / 최근 로그인순 / 이름순.
- Columns:
  - 이름 · 담당자: name, with the masked email muted underneath
  - 역할
  - 가입 단계: 역할 선택 / 정보 입력 {done}/{total} / 가입 완료. Totals are retailer 11 and uncle 7; done = total minus missing field count.
  - 사업자 서류 chip
  - 로그인 수단: Google / Kakao / 이메일
  - 연결 {n}곳
  - 진행 중 요청 {n}건
  - 상태: 이용 중 / 이용 제한
  - 최근 로그인
  - 가입일
- Empty: "조건에 맞는 계정이 없어요" / "검색어나 필터를 바꿔 보세요."

**Dossier** `/admin/accounts/[id]` (`get_account`):
- Header: name, role chip, verification chip, moderation chip, "가입일 …".
- Operator actions:
  - "서류 확인"
  - "이용 제한" or "이용 재개"
  - "메모 남기기"
  - "케이스 열기"
  - Fixed note: "역할 변경과 탈퇴 처리는 제공하지 않아요."
- Tabs:
  - **프로필**: a definition list. Viewer note "열람자 권한에서는 연락처가 가려져요.". When incomplete, "입력이 남은 항목: {labels}". Missing-field labels:

    | Key | Label |
    |---|---|
    | name | 매장명 |
    | contact | 담당자명 |
    | phone | 연락처 |
    | businessName | 사업자명 |
    | businessNumber | 사업자등록번호 |
    | documentId | 사업자등록증 |
    | address | 주소 |
    | addressDetail | 상세주소 |
    | salesChannel | 판매 채널 |
    | pickupArea | 도매 픽업 구역 |
    | deliveryArea | 소매 배송 지역 |
    | deadline | 요청 마감시간 |
    | terms | 이용약관 동의 |
    | privacy | 개인정보 동의 |
    | phone:format | 연락처 형식 |
    | businessNumber:format | 사업자등록번호 형식 |
    | deadline:format | 마감시간 형식 |
    | role | 역할 선택 |
    | bootstrap | 앱 첫 실행 전 |

  - **서류**: document metadata, then "사유와 함께 열람". The ReasonDialog title is "서류를 열람할까요?", with the line "열람 사유와 운영자 이름이 감사 로그에 남아요." and a 사유 field of at least 5 characters. The preview is an image, or a PDF in an iframe. The note "링크는 60초 동안만 열려요" sits next to "다시 열기".
    - Review form (operator):
      - 결과: 확인함 / 재제출 요청 / 검토 초기화
      - "앱에 보일 안내" (required for 재제출 요청, at most 300 characters)
      - "내부 메모" (at most 2,000 characters, not shown to the user)
      - Checklist: "상호가 일치해요", "사업자등록번호가 일치해요", "이미지가 선명해요"
      - Button "검토 결과 저장"
    - Honest copy: "국세청 사업자 상태 조회는 아직 연결되지 않았어요. 서류 이미지를 확인한 결과만 기록돼요."
    - A stale document id surfaces the DB message "사용자가 서류를 다시 제출했어요. 최신 서류를 확인해 주세요.".
    - Review history.
  - **연결**: partner, direction (보낸 요청 / 받은 요청), status, date.
  - **요청 이력**: label counts as chips, plus the last 20 requests linking to the request sheet.
  - **첨부**: usage chips 사업자 서류 / 프로필 사진 / 요청 사진 / 채팅 사진. File names are hidden for viewers.
  - **처리 이력**: recent audit for this account.
  - **운영 메모 · 케이스**: NotesPanel and CasePanel.
- Suspend AlertDialog: "이 계정의 이용을 제한할까요?" / "요청과 채팅 기록은 그대로 남고, 이 계정은 앱에서 새 기록을 남길 수 없어요."
  - Fields: "사유 (내부용)" (at least 5 characters), "앱에 보일 안내" (at most 300, default "이용이 제한된 계정이에요. 고객센터로 문의해 주세요."), checkbox "로그인도 막기" (on).
  - Confirm "이용 제한". Success "이용을 제한했어요".
- Restore: "이용을 다시 허용할까요?" / "제한하면서 막은 로그인도 함께 풀려요." Field 사유. Confirm "이용 재개".

### 10.8 거래처 연결 `/admin/connections` (viewer)
- Data: `list_records('connections')`.
- Views: 전체 · 수락 대기 · 수락 대기 3일 넘음 · 오늘 연결 · 연결 완료.
- Columns:
  - 요청한 쪽 → 받은 쪽 (role icon and name)
  - 상태: 수락 대기 / 연결 완료 / 거절 / 철회
  - 요청 일시
  - 대기 시간 ("{n}일째", pending only)
- Banner: "연결 수락과 해제는 두 거래처만 할 수 있어요."
- Empty: "조건에 맞는 연결이 없어요".

### 10.9 사입 요청 `/admin/requests`, `/admin/requests/[id]` (viewer)

**List** (`list_requests`):
- Tabs with counts (`p_labels`):

  | Tab | Labels |
  |---|---|
  | 전체 | all |
  | 확인 대기 | 확인 대기 |
  | 진행 중 | 진행 중, 픽업 완료, 미송 대기 |
  | 답변 필요 | 답변 필요 |
  | 미송 재확인 | 미송 재확인 |
  | 수령 대기 | 수령 대기 |
  | 문제 확인 중 | 문제 확인 중 |
  | 변경·취소 협의 중 | 변경·취소 협의 중 |
  | 완료 | 완료 |
  | 종료 | 거절, 취소 종료 |

  `view=attention` maps to 답변 필요 and 문제 확인 중.
- Filters:
  - 기간 (요청 시각, date range)
  - 거래처: account combobox through `search`, sets `account`
  - 조건 (single select): 열린 문제 있음 / 협의 진행 중 / 수령 대기 / 재확인일 지남 / 하루 넘은 확인 대기 / 사진 있음 / 수량 기록 불일치
- Search: "상품명·옵션·도매처·요청 ID로 검색".
- Sort: 최근 처리순 / 요청 최신순 / 요청 오래된순 / 재확인일 빠른순.
- Columns:
  - 요청 시각
  - 상태
  - 소매업자
  - 사입삼촌
  - 도매처: name, with location muted
  - 상품 · 옵션
  - 요청 · 확보 · 전달 · 수령 (장): "3 · 2 · 1 · 1"
  - 남은 미송: "{n}장"
  - 재확인일: date plus D-day chip
  - 최근 처리: event title, first line only, plus relative time
  - 버전: "v{n}"
- Footer: "{total}건 · 요청 {q}장 · 확보 {a}장 · 전달 {d}장 · 수령 {r}장 · 남은 미송 {b}장".
- Toolbar (operator): "CSV 내보내기" opens a dialog with 기간 and 사유, then POSTs to `/admin/export/requests`.
- Empty: "조건에 맞는 요청이 없어요" / "검색어나 상태 필터를 바꿔 보세요."
- A row click opens the Sheet (intercepted route) and keeps the list scroll position and selection. A direct URL renders the full page.

**Detail** (`get_request`):
- Header: "{상품} · {옵션}", label chip, "요청 {KST}", "{소매업자} → {사입삼촌}" with links to the dossiers.
- Ledger tiles laid out like the app: 누적 확보 / 전달 대기 / 누적 전달 / 남은 미송, then a row 요청 / 수령 / 취소 / 처리 보류, all in 장.
- If `checks.violations` is not empty: a red banner "수량 기록이 서로 맞지 않아요", the codes as Korean, and "앱 밖에서 기록이 바뀌었을 수 있어요. 개발팀에 공유해 주세요." Code labels:

  | Code | Label |
  |---|---|
  | received_gt_delivered | 수령이 전달보다 많아요 |
  | delivered_gt_acquired | 전달이 확보보다 많아요 |
  | negative_counter | 음수 수량이 있어요 |
  | held_out_of_range | 처리 보류 수량이 범위를 벗어났어요 |
  | delivered_ne_sum_deliveries | 전달 합계가 회차 합과 달라요 |
  | received_ne_sum_delivery_receipts | 수령 합계가 회차 합과 달라요 |
  | open_issues_ne_unresolved_issues | 열린 문제 수가 맞지 않아요 |
  | held_ne_issue_and_proposal_holds | 보류 합계가 맞지 않아요 |
  | proposal_pointer_mismatch, multiple_pending_proposals | 협의 기록이 맞지 않아요 |
  | completed_but_open, finished_but_not_closed | 완료 상태가 맞지 않아요 |
  | any other code | 수량 규칙을 벗어났어요 |

- Tabs:
  - **처리 이력**: a timeline of event title (first line bold, second line muted), actor role (소매업자/사입삼촌), KST time and relative time, and a diff of 요청/확보/전달/수령/취소/보류 shown as "2 → 3" (before and after for operator+; viewers get the after-ledger only). 업무 기록 cards look different from chat.
  - **전달 회차**: {n}차, 전달 일시, 이번 전달, 확인한 수량, 실제 받은 수량, 상태 (수령 대기 / 수령 확인 / 수량 차이), "정정됨".
  - **변경·취소·정정**: 종류 (변경/취소/정정), 제안자, 상태 (상대 확인 대기 / 확정 / 거절 / 철회), 사유, a summary of the values, 시각.
  - **문제**: 유형 (the first line of reason: 상품·옵션이 달라요 / 수량이 부족해요 / 오염·파손이 있어요 / 수령 수량 차이), 설명, 보고자, 상태, 보류 {n}개, 조치 (action), 열린 기간.
  - **첨부 사진**: thumbnails behind "사유와 함께 열람" (a ReasonDialog prefilled with "요청 사진 확인", editable).
  - **관련 채팅**: counts "업무 기록 {n} · 메시지 {n}" and "채팅 열람으로 이동" → `/admin/chats?a=&b=`.
  - **운영 메모 · 케이스**: the case form includes "담당 운영자" (case assignee).
- Fixed note: "기록을 고치려면 두 거래처가 앱에서 정정을 제안하고 확정해야 해요." Actions: "링크 복사", "메모 남기기", "케이스 열기".

### 10.10 전달·수령 `/admin/deliveries` (viewer)
- Data: `list_records('deliveries', p_filter)`.
- Views: 전체 · 수령 대기 · 48시간 넘음 · 수량 차이 · 정정된 회차.
- Columns:
  - 회차 ("{n}차")
  - 전달 일시
  - 사입삼촌 → 소매업자
  - 상품 · 옵션 (snapshot)
  - 이번 전달 {n}장
  - 확인한 수량 {n}장
  - 실제 받은 수량 {n}장
  - 상태
  - 수령지 (masked for viewers)
  - 대기 시간 ("{n}시간째" until received)
  - 정정 ("정정됨")
- A row opens the request sheet.
- Empty: "조건에 맞는 전달 회차가 없어요".

### 10.11 미송 재확인 `/admin/backorders` (viewer)
- Data: `list_requests(p_attention, sort recheck_asc)`.
- Views:

  | View | Filter |
  |---|---|
  | 전체 미송 | backorder |
  | 오늘 재확인 | recheck_today |
  | 기한 지남 | recheck_overdue |
  | 재확인 도래 (`view=due`) | recheck_due |
  | 답변 필요 | labels 답변 필요 |

- Columns:
  - 재확인일 with D-day chip
  - 남은 미송 {n}장
  - 답변 상태: 답변 필요 / 기다리기로 함 / 취소 협의 중
  - 소매업자
  - 사입삼촌
  - 상품 · 옵션
  - 최근 처리: event title line 1, with the reason (line 2) muted
  - 재확인 알림: "보냄 · {KST}" / "아직 없음"
- Chart: "미송 경과", the same bucket bars as the dashboard.
- Honest copy: "재확인 알림은 사입삼촌 앱이 열려 있을 때만 만들어져요."
- Empty: "기다리는 미송이 없어요".

### 10.12 문제·정정 `/admin/issues` (viewer)
- 3-pane triage: list, detail, and a 속성 panel with 상태, 보류 수량, 열린 기간, 관련 요청 and 관련 회차.
- Tab **문제** (`list_records('issues')`): views 열린 문제 (unresolved) / 조치 완료 · 해결 확인 대기 (status actionTaken) / 해결 확인 (resolved).
  - Columns: 유형, 보고자, 열린 기간, 보류 {n}개, 관련 회차, 최근 조치.
- Tab **변경·취소·정정** (`list_records('proposals')`): views 상대 확인 대기 / 확정 / 철회 / 거절.
  - Columns: 종류, 제안자, 사유, "요청 {q} · 확보 {a} · 전달 {d} · 수령 {r} · 취소 {c}" (from the request), 대기 시간.
- Fixed note: "문제 해결 확인은 소매업자만, 정정 확정은 상대 거래처만 할 수 있어요. 운영자는 메모와 케이스로 도와요."

### 10.13 채팅 열람 `/admin/chats` (list: viewer; transcript: operator)
- List (`list_conversations`): 거래처 쌍, 연결 상태, 마지막 메시지 시각, 메시지 {n}, 업무 기록 {n}, 연결된 요청 {n}, 안 읽음 {n}, 사진 포함 {n}. Bodies are never shown.
  - The IA's "전송 실패" column is dropped: failed sends exist only in the device outbox.
- "사유와 함께 열람" (operator) opens an AlertDialog "대화를 열람할까요?" / "열람 사유와 운영자 이름이 감사 로그에 남아요." with a 사유 field of at least 5 characters.
  - The transcript returns from a Server Action into client state. It is never a URL and never sits in the RSC cache.
  - Layout: 3 panes (pairs, thread, 속성: 연결 상태, related requests, 사유).
  - Read-only. 업무 기록 cards versus bubbles, as in the app. Phone numbers are masked server-side. Attachments open through `attachment_access` with the same reason.
  - "이전 대화 더 보기" pages backwards with `p_before`.
- Viewer: the button is disabled, with the tooltip "운영자 이상만 대화를 열람할 수 있어요.".
- `?a=&b=` pre-selects a pair.

### 10.14 알림·공지 `/admin/notices` (viewer; writes: operator)
- **Tab 알림 기록** (`list_records('notices')`):
  - Columns: 받는 계정, 종류 (연결/요청/전달/채팅), 제목 (chat shows "[채팅 알림]"), 읽음, 생성 시각, 대상 (request link).
  - Views: 전체 · 안 읽음 · 오늘.
- **Tab 공지** (`list_notices`):
  - Columns: 제목, 대상 (전체/소매업자/사입삼촌), 중요도 (안내/중요/긴급), 노출 기간, 상태 (초안/예약/게시 중/종료), 닫기 허용, 버전, 최근 변경.
  - Editor Sheet fields: 제목 (≤80), 내용 (≤2,000), 대상, 중요도, 링크 (https only), 시작, 종료, 닫기 허용, 게시. A preview renders in the app's card style.
  - Buttons: "초안 저장", "공지 게시", "공지 내리기" (sets active=false).
  - Publish dialog: "공지를 게시할까요?" / "{대상}에게 앱을 열 때 보여요."
  - Critical needs the owner, and operators see "긴급 공지는 관리자만 게시할 수 있어요.".
- Banner (always): "원격 푸시는 아직 연결하지 않았어요. 공지는 앱이 이 기능을 지원하도록 업데이트된 뒤부터, 앱을 열 때 보여요."

### 10.15 원격 설정 `/admin/remote-config` (viewer read; operator: feature_flags, support; owner: all)
- List: 항목, 현재 값 (human summary), 공개 (앱에 전달 / 내부용), 수정 권한 (관리자/운영자), 최근 변경 (운영자 · 시각), 버전.
- Each key's editor Sheet shows a before/after diff, a required 사유, and the optimistic version.
  - **점검 모드**:
    - Switches "점검 모드" and "쓰기 차단 (점검 중 모든 앱 쓰기 거부)", where 쓰기 차단 requires 점검 모드.
    - 제목 (≤60), 안내 (≤500), 시작 and 종료 (KST).
    - Typed confirmation: enter "점검 시작" to enable.
    - Dialog "점검 모드를 켤까요?" / "켜면 모든 사용자가 점검 안내만 보게 돼요. 쓰기 차단을 켜면 앱의 모든 저장이 거부돼요."
  - **최소 지원 버전**:
    - Per iOS/Android/Web: 최소 버전, 권장 버전 (semver), 스토어 주소 (https). Plus 안내 문구 (≤300).
    - Typed confirmation "업데이트 강제" when the minimum rises.
    - Dialog "최소 버전을 올릴까요?" / "이 버전보다 낮은 앱은 업데이트 전까지 쓸 수 없어요."
  - **기능 스위치**: name → on/off rows, plus "스위치 추가" for an English camelCase key. Note "앱은 키가 없으면 기본값을 써요."
  - **고객센터 안내**: 카카오톡 채널, 이메일, 전화, 운영 시간.
- 변경 기록: `list_audit(target_type config, target_id key)` with before → after. "되돌리기" prefills the editor with the old value (it does not save directly).
- Success: "설정을 저장했어요. 앱은 다음 새로고침 때 반영해요."
- Banner: "앱이 이 설정을 읽도록 업데이트된 뒤부터 반영돼요. 단, 쓰기 차단과 이용 제한은 서버에서 바로 적용돼요."

### 10.16 랜딩 문의 `/admin/leads` (viewer masked; operator writes)
- Data: `list_leads`.
- Views: 새 문의 · 오늘 · 전체 · 의심 제외 (`p_include_suspect=false`).
- Columns:
  - 접수 시각
  - 역할 (소매업자/사입삼촌/기타)
  - 이름 · 매장
  - 연락처 (masked for viewers)
  - 사입 시장
  - 남긴 말: first 40 characters (operators only)
  - 유입: source and utm_source / utm_campaign
  - 의심 표시 ("빠른 제출" for timing-suspect, "테스트" for e2e)
  - 처리 상태: 새 문의 / 연락함 / 상담 중 / 가입 전환 / 스팸 / 종료
  - 담당
  - 메모 {n}
- Row Sheet: full lead, status select, 담당 select (operators+), "메모 남기기". CSV (owner): "개인정보가 담긴 파일이에요. 사유를 남기고 내려받아요."
- Empty: "아직 랜딩 문의가 없어요".

### 10.17 감사 로그 `/admin/audit` (operator)
- **Tab 감사 로그** (`list_audit`):
  - Filters: 작업 (열람 / 내보내기 / 설정 변경 / 메모·케이스 / 계정 조치 / 권한 변경), 운영자, 대상 종류, 기간.
  - Columns: 시각, 운영자, 작업, 대상 (종류 · ID · 이름 when resolvable), 사유, 변경 전 → 후, 접속 정보 (IP · 브라우저).
  - No edit or delete UI. Note "감사 기록은 수정하거나 지울 수 없어요."
- **Tab 앱 작업 기록** (`list_operations`):
  - Columns: 시각, 계정, 명령 (command), 결과, 작업 번호. Filter by 명령 and 계정.
  - Note "앱이 보낸 명령 이름과 결과만 보여요. 내용은 보이지 않아요."
- Owner: "무결성 확인" runs `verify_audit_chain`.
  - Success: "감사 기록 {n}건이 모두 이어져 있어요. 마지막 해시 {head12}…"
  - Broken: "{id}번 기록부터 체인이 맞지 않아요. 개발팀에 바로 알려 주세요."
- Action labels:

  | Action | Label |
  |---|---|
  | account.view | 계정 열람 |
  | conversation.view | 대화 열람 |
  | attachment.view | 파일 열람 |
  | lead.view_list | 문의 목록 열람 |
  | admin.lookup | 운영 계정 조회 |
  | export.* | CSV 내보내기 |
  | account.review_document | 서류 검토 |
  | account.suspend | 이용 제한 |
  | account.restore | 이용 재개 |
  | note.add | 메모 |
  | case.open | 케이스 열기 |
  | case.update | 케이스 변경 |
  | notice.create | 공지 작성 |
  | notice.update | 공지 변경 |
  | config.set | 설정 변경 |
  | admin.grant | 권한 부여 |
  | admin.revoke | 권한 해제 |
  | lead.set_status | 문의 상태 변경 |

### 10.18 운영 계정 `/admin/admins` (owner)
- Columns: 이름, 이메일, 역할 (관리자/운영자/열람자), 2단계 인증 (등록됨 {n}개 / 미등록; "필수" chip if require_mfa), 최근 로그인, 상태 (활성/해제됨).
- "운영 계정 추가":
  1. Enter an email (`lookup_user`). It shows providers, email confirmation and whether the user has an app account.
  2. Fill 역할, 이름, "2단계 인증 필수" (on). Submit "권한 부여".
  - Failure messages come from the DB verbatim.
- Row actions: "역할 변경", "해제". The 해제 dialog: "이 운영 계정을 해제할까요?" / "로그인은 되지만 모든 운영 화면과 작업이 바로 막혀요." plus 사유.
- The owner's own row has no actions: "본인 권한은 다른 관리자가 변경해야 해요."

### 10.19 내 계정 `/admin/account` (viewer)
- Shows 이름, 이메일, 역할, and 2단계 인증 status with "등록하기".
- Buttons "로그아웃" and "모든 기기에서 로그아웃".
- Note: "운영 계정은 앱 계정과 분리해서 써 주세요."

