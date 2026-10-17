-- 비공개 스키마 접근은 이미 차단되어 있다. 팀·편의 보조 함수의 기본 PUBLIC
-- 실행 권한도 제거해 다른 비공개 함수와 동일하게 서버 RPC 내부에서만 사용한다.
-- 공개 RPC, service_role 권한, 백오피스 함수와 업무 데이터는 변경하지 않는다.
revoke all on function
  saip_private.convenience_account(uuid),
  saip_private.convenience_first_text(jsonb,text[]),
  saip_private.convenience_has_any_key(jsonb,text[]),
  saip_private.convenience_now(),
  saip_private.convenience_payment_mode(text),
  saip_private.convenience_published_at(jsonb),
  saip_private.convenience_release_platform_valid(jsonb),
  saip_private.convenience_require_retailer(uuid),
  saip_private.convenience_strip_release_audience(jsonb),
  saip_private.convenience_text_array(jsonb,text[]),
  saip_private.convenience_texts(jsonb),
  saip_private.convenience_truthy(jsonb,text[]),
  saip_private.team_account_label(text),
  saip_private.team_area_matches_job(jsonb,jsonb),
  saip_private.team_before_cutoff(text),
  saip_private.team_job_area_label(jsonb),
  saip_private.team_job_started(jsonb),
  saip_private.team_job_target_label(jsonb),
  saip_private.team_join_nonempty(text[],text),
  saip_private.team_member_available_for_area(jsonb,text,boolean),
  saip_private.team_member_load(text),
  saip_private.team_package_summary(jsonb),
  saip_private.team_package_summary_list(text[]),
  saip_private.team_put_source_card(text,uuid,text,text,text,text,text,text,text[],text[]),
  saip_private.team_single_request_id_for_packages(text[])
from public, anon, authenticated;
