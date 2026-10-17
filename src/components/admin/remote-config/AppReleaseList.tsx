import { workflowRpc } from "@/lib/admin/rpc/workflows";
import type { ReleaseMetadata } from "@/lib/admin/rpc/workflow-schemas";
import { DefinitionList } from "../common/DefinitionList";
import { EmptyState } from "../states/EmptyState";
import { ErrorState } from "../states/ErrorState";
import { pageNumber, WorkflowPager, type WorkflowParams } from "../workflows/WorkflowExplorer";

const FIELD_LABELS: Record<string, string> = {
  public: "공개", published: "게시", available: "제공", enabled: "활성", released: "출시",
  platform: "대상 플랫폼", publishedAt: "게시 시각", releasedAt: "출시 시각",
  availableAt: "제공 시작", publicAt: "공개 시작", startsAt: "시작 시각", createdAt: "등록 시각",
  buildNumber: "빌드 번호", build: "빌드", versionCode: "버전 코드",
  versionName: "버전 이름", version: "버전", buildName: "빌드 이름", title: "제목", headline: "헤드라인",
  storeUrl: "스토어 주소", updateUrl: "업데이트 주소", appStoreUrl: "App Store 주소",
  playStoreUrl: "Play Store 주소", url: "주소",
};
const TARGETING = { none: "제한 없음", restricted: "대상 지정됨", invalid: "잘못된 대상 형식" };

function ReleaseFields({ metadata, inherited = false }: { metadata: ReleaseMetadata; inherited?: boolean }) {
  const items = Object.entries(metadata.fields).map(([key, value]) => ({
    term: `${FIELD_LABELS[key] ?? key} (${key})`,
    // Addresses are deliberately plain text: source metadata is not a verified link.
    value: typeof value === "boolean" ? (value ? "켜짐" : "꺼짐") : String(value),
  }));
  return (
    <div className="space-y-3">
      {!metadata.validObject ? <p className="text-sm text-destructive">릴리스 정보 형식이 잘못됐어요.</p> : null}
      {metadata.invalidFields.length ? <p className="text-sm text-destructive">확인이 필요한 필드: {metadata.invalidFields.join(", ")}</p> : null}
      {!inherited && metadata.fields.public === undefined ? <p className="text-sm text-muted-foreground">공개(public) 값이 설정되지 않았어요.</p> : null}
      <DefinitionList items={[
        ...items,
        { term: "비공개 지정", value: metadata.privateAudience ? "비공개" : inherited ? "재정의 값에 비공개 지정 없음" : "없음" },
        { term: "역할 대상", value: TARGETING[metadata.roleTargeting] },
        { term: "계정 대상", value: TARGETING[metadata.userTargeting] },
      ]} />
    </div>
  );
}

export async function AppReleaseList({ params }: { params: WorkflowParams }) {
  const page = pageNumber({ page: params.releasePage });
  const result = await workflowRpc.releases((page - 1) * 25);
  return (
    <section aria-labelledby="app-releases-heading" className="space-y-4">
      <div className="space-y-2">
        <h2 id="app-releases-heading" className="text-lg font-semibold">앱 릴리스 · 조회</h2>
        <p className="text-sm text-muted-foreground">최신 앱의 업데이트 안내는 별도 릴리스 기록을 읽어요. 위의 최소 지원 버전을 변경해도 릴리스 기록은 바뀌지 않아요.</p>
        <p className="text-sm text-muted-foreground">공통 공개 조건을 먼저 통과해야 하며, 플랫폼 값은 공통 값에 덮어쓴 뒤 다시 검사해요. 실제 안내는 계정 상태·역할·대상 지정·공개 시각·설치 빌드·공식 스토어 주소에 따라 달라져요. 대상 계정 목록과 내부 메모는 표시하지 않아요.</p>
      </div>
      {!result.ok ? <ErrorState message={result.error.message} /> : <>
        <WorkflowPager path="/admin/remote-config" params={params} page={page} total={result.data.total} pageKey="releasePage" />
        {result.data.rows.length === 0 ? <EmptyState title="등록된 앱 릴리스가 없어요." description="릴리스가 등록되면 플랫폼별 버전과 공개 조건을 여기서 확인할 수 있어요." /> : null}
        {result.data.rows.map((row) => (
          <article key={row.id} className="space-y-4 rounded-xl border bg-card p-5">
            <h3 className="font-semibold">{String(row.root.fields.title || row.root.fields.headline || "앱 릴리스")}</h3>
            <p className="break-all font-mono text-xs text-muted-foreground">{row.id}</p>
            <h4 className="text-sm font-medium">공통 조건과 버전</h4>
            <ReleaseFields metadata={row.root} />
            {row.invalidVariants.length ? <p className="text-sm text-destructive">플랫폼 설정 형식 확인 필요: {row.invalidVariants.join(", ")}</p> : null}
            {row.variantSource === "shared" ? <p className="text-sm text-muted-foreground">플랫폼별 재정의가 없어 공통 값을 사용해요.</p> : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{row.variantSource === "platforms" ? "platforms 설정을 사용해요. 루트 iOS·Android 설정보다 우선해요." : "루트 iOS·Android 설정을 사용해요."} 아래는 플랫폼별 재정의 값이에요. 생략된 필드는 공통 값을 따르며, 공통 조건의 제한도 적용돼요.</p>
                {(["ios", "android"] as const).map((platform) => (
                  <div key={platform} className="space-y-3 rounded-lg border p-4">
                    <h4 className="font-medium">{platform === "ios" ? "iOS" : "Android"} 재정의</h4>
                    {row.variants[platform] ? <ReleaseFields metadata={row.variants[platform]} inherited /> : <p className="text-sm text-muted-foreground">유효한 플랫폼 설정이 없어 이 플랫폼에는 제공되지 않아요.</p>}
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </>}
    </section>
  );
}
