"use client";

import { useState } from "react";
import {
  GROUPS,
  WORKFLOWS,
  WORKFLOW_STATUSES,
  VALUE_LABELS,
  type WorkflowCollection,
  type WorkflowGroup,
} from "@/lib/admin/workflows";

export function WorkflowFilterFields({
  group,
  collection,
  status,
}: {
  group: WorkflowGroup;
  collection: WorkflowCollection;
  status: string;
}) {
  const [selected, setSelected] = useState(collection);
  const [selectedStatus, setSelectedStatus] = useState(status);
  const statuses = WORKFLOW_STATUSES[selected] ?? [];
  return (
    <>
      <label className="flex flex-col gap-1 text-xs">
        업무 종류
        <select
          name="collection"
          value={selected}
          onChange={(event) => {
            setSelected(event.target.value as WorkflowCollection);
            setSelectedStatus("");
          }}
          className="h-9 rounded-md border bg-background px-3"
        >
          {GROUPS[group].map((key) => (
            <option key={key} value={key}>
              {WORKFLOWS[key].label}
            </option>
          ))}
        </select>
      </label>
      {statuses.length ? (
        <label className="flex flex-col gap-1 text-xs">
          상태
          <select
            name="status"
            value={selectedStatus}
            onChange={(event) => setSelectedStatus(event.target.value)}
            className="h-9 rounded-md border bg-background px-3"
          >
            <option value="">전체 상태</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {VALUE_LABELS[value] ?? value}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  );
}
