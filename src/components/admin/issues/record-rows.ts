import type { RecordCollection } from "@/lib/admin/rpc/enums";
import type { RecordList, RecordRow } from "@/lib/admin/rpc/schemas";

/**
 * The typed rows of a list_records result for `collection`. zod has already
 * parsed every row with that collection's schema (recordListSchemas); only
 * the static type of RecordList<C>["rows"] widens to unknown[] through the
 * generic recordList() helper in rpc/schemas.ts (reported to WP-03).
 */
export function recordRows<C extends RecordCollection>(collection: C, list: RecordList<C>): RecordRow<C>[] {
  void collection;
  return list.rows as RecordRow<C>[];
}
