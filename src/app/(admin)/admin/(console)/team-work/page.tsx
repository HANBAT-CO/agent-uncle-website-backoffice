import { PageHeader } from "@/components/admin/common/PageHeader";
import {
  WorkflowExplorer,
  type WorkflowParams,
} from "@/components/admin/workflows/WorkflowExplorer";
export const metadata = { title: "팀·동료 업무" };
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<WorkflowParams>;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="팀·동료 업무"
        description="팀·동료 연결, 담당 구역, 픽업, 포장물 인계와 수령을 확인하세요."
      />
      <WorkflowExplorer group="team-work" params={await searchParams} />
    </div>
  );
}
