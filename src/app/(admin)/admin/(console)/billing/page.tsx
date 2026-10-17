import { PageHeader } from "@/components/admin/common/PageHeader";
import {
  WorkflowExplorer,
  type WorkflowParams,
} from "@/components/admin/workflows/WorkflowExplorer";
export const metadata = { title: "청구·정산" };
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<WorkflowParams>;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="청구·정산"
        description="현장 결제부터 청구 조정, 입금 확인, 대납·환불까지 연결해 확인하세요."
      />
      <WorkflowExplorer group="billing" params={await searchParams} />
    </div>
  );
}
