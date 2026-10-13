import { PropertiesPanel, type TriageProperties } from "./PropertiesPanel";

/**
 * The 3-pane triage layout (screens 10.12): list, detail (with the memo
 * below it) and 속성. From 1280px the three panes sit side by side and 속성
 * stays in view while the list scrolls; below that (usable down to 1024px,
 * spec D12) 속성 moves between the detail and the memo in the second column.
 */
export function TriagePanes({
  list,
  detail,
  memo,
  properties,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  memo: React.ReactNode;
  properties: TriageProperties | null;
}) {
  return (
    <div data-testid="triage" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] xl:grid-cols-[minmax(0,1fr)_17.5rem_13.5rem]">
      {list}
      <div className="flex min-w-0 flex-col gap-4">
        {detail}
        {properties ? (
          <div className="min-w-0 xl:hidden">
            <PropertiesPanel properties={properties} />
          </div>
        ) : null}
        {memo}
      </div>
      {properties ? (
        <div className="hidden min-w-0 xl:sticky xl:top-4 xl:block">
          <PropertiesPanel properties={properties} />
        </div>
      ) : null}
    </div>
  );
}
