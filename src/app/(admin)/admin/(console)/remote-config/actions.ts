"use server";

import { configSubmissionSchema, CONFIG_MESSAGES } from "@/components/admin/remote-config/config-forms";
import { runAdminAction, type ActionState } from "@/lib/admin/actions";
import { rpc } from "@/lib/admin/rpc";

/*
 * 원격 설정 writes (spec 6, 11; screens 10.15). Reachable by a direct POST,
 * so the role, the operation id and the value are checked again here
 * (runAdminAction + the validate_config mirror). Postgres decides the rest:
 * owner-only keys (42501), the optimistic version ("다른 운영자가 …", a
 * conflict that keeps the input) and its own validate_config.
 */

/** fields: key, version, reason, value (JSON), operationId */
export async function setConfigAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAdminAction({
    minRole: "operator",
    formData: fd,
    schema: configSubmissionSchema,
    call: (input, operationId) =>
      rpc.setConfig({ key: input.key, value: input.value, reason: input.reason, version: input.version, operationId }),
    success: CONFIG_MESSAGES.saved,
    revalidate: ["/admin/remote-config", "/admin/audit"],
  });
}
