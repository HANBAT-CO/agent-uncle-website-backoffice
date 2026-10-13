import { FileIcon, FilePdfIcon, ImageIcon } from "@phosphor-icons/react/dist/ssr";

import { KstTime } from "@/components/admin/common/KstTime";
import { bytes } from "@/lib/admin/format";
import { ATTACHMENT_USAGE_LABEL } from "@/lib/admin/labels";
import type { AccountDossier } from "@/lib/admin/rpc/schemas";

function kindOf(mime: string | null | undefined): { label: string; Icon: typeof FileIcon } {
  if (mime?.includes("pdf")) return { label: "PDF", Icon: FilePdfIcon };
  if (mime?.startsWith("image/")) return { label: "이미지", Icon: ImageIcon };
  return { label: "파일", Icon: FileIcon };
}

/**
 * 첨부 (screens 10.7): the account's files with usage chips 사업자 서류 /
 * 프로필 사진 / 요청 사진 / 채팅 사진. File names are hidden for viewers (the
 * SQL leaves them out); opening a file happens in 서류 or the request.
 */
export function AttachmentsTab({ attachments, masked }: { attachments: AccountDossier["attachments"]; masked: boolean }) {
  if (attachments.length === 0) {
    return <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">올린 파일이 없어요</p>;
  }
  const totalBytes = attachments.reduce((sum, file) => sum + file.size, 0);

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {attachments.map((file) => {
          const { label, Icon } = kindOf(file.mime);
          return (
            <li key={file.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
              <Icon aria-hidden weight="bold" className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {masked ? <span className="font-normal text-muted-foreground">이름 숨김</span> : file.name || label}
              </span>
              <span className="flex flex-wrap gap-1">
                {file.usage.length > 0 ? (
                  file.usage.map((usage) => (
                    <span key={usage} className="inline-flex h-6 items-center rounded-full border px-2 text-xs">
                      {ATTACHMENT_USAGE_LABEL[usage] ?? usage}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">쓰이지 않음</span>
                )}
              </span>
              <span className="w-14 text-xs text-muted-foreground">{label}</span>
              <span className="num w-16 text-right text-xs text-muted-foreground">{bytes(file.size)}</span>
              <KstTime iso={file.createdAt} className="w-28 text-xs text-muted-foreground" />
            </li>
          );
        })}
      </ul>
      <p className="num text-xs text-muted-foreground">
        첨부 {attachments.length.toLocaleString("ko-KR")}개 · {bytes(totalBytes)}
        {masked ? " · 열람자 권한에서는 파일 이름이 보이지 않아요." : ""}
      </p>
    </div>
  );
}
