"use client";

import { ArrowRightIcon, ArrowUpRightIcon, CursorIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { ParcelFigure } from "./ParcelFigure";
import type { Stage, StageKey } from "./stages";

const DETAILS: Record<StageKey, { title: string; description: string; view: string }> = {
  "확인 대기": { title: "첫 확인을 기다리고 있어요", description: "새로운 사입 요청을 확인하고, 사입삼촌과의 다음 연결을 준비하세요.", view: "pending" },
  "진행 중": { title: "사입이 이어지고 있어요", description: "상품 확보부터 미송·문제 확인까지, 진행 중인 모든 요청을 살펴보세요.", view: "active" },
  "수령 대기": { title: "마지막 확인이 남았어요", description: "전달된 상품이 매장에 잘 도착했는지, 수령 확인을 기다리는 요청이에요.", view: "receipt" },
  완료: { title: "매장까지 잘 도착했어요", description: "수령 완료 요청의 입금 전·입금 완료 상태를 함께 확인하세요.", view: "received" },
};

/** Four keyboard-accessible views of the real request pipeline. */
export function StageBar({ stages, ended, includeDemo = false }: { stages: Stage[]; ended: number; includeDemo?: boolean }) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const active = stages[selected];
  const detail = DETAILS[active.key];
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  const href = (view: string) => `/admin/requests?view=${view}${includeDemo ? "&demo=1" : ""}`;

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % stages.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + stages.length - 1) % stages.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = stages.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  }

  return (
    <section data-testid="chart-stages" aria-labelledby={`${id}-title`} className="flow-panel">
      <div className="flow-top">
        <div className="flow-copy">
          <h2 id={`${id}-title`} className="flow-heading"><span aria-hidden />요청 단계<span className="flow-heading-separator" aria-hidden />REQUEST FLOW</h2>
          <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${selected}`} tabIndex={0} className="flow-detail">
            <div className="flow-detail-heading">
              <h3>{detail.title}</h3>
              <span className="flow-detail-count num">{active.count.toLocaleString("ko-KR")}<small>건</small></span>
            </div>
            <p className="flow-description">{detail.description}</p>
            <Link href={href(detail.view)} className="flow-link mt-3.5">
              {active.key} 요청 보기 <ArrowUpRightIcon aria-hidden weight="bold" className="size-3.5" />
            </Link>
          </div>
        </div>
        <Link href={href("closed")} className="flow-ended"><span data-testid="stages-ended">종료 {ended.toLocaleString("ko-KR")}건</span><ArrowUpRightIcon aria-hidden className="size-3" /></Link>
        <div className="flow-figure-wrap" aria-hidden="true">
          <ParcelFigure stage={selected} />
          <span className="flow-figure-caption"><CursorIcon className="size-3" />마우스로 펼쳐보기</span>
        </div>
      </div>
      <div role="tablist" aria-label="요청 단계" className="flow-stages">
        {stages.map((stage, index) => (
          <button
            key={stage.key}
            ref={(node) => { tabs.current[index] = node; }}
            id={`${id}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={selected === index}
            aria-controls={`${id}-panel`}
            tabIndex={selected === index ? 0 : -1}
            data-stage={stage.key}
            className="flow-stage"
            onClick={() => setSelected(index)}
            onKeyDown={(event) => navigate(event, index)}
          >
            <span className="flow-stage-top"><span data-stage-legend={stage.key}>{stage.key}</span><span className="flow-stage-number num">0{index + 1}</span></span>
            <span className="flow-stage-bottom"><span className="flow-stage-count num">{stage.count.toLocaleString("ko-KR")}<small>건</small></span><span className="flow-track" aria-hidden><span className="flow-track-fill block" style={{ width: `${total ? stage.count / total * 100 : 0}%` }} /></span><ArrowRightIcon aria-hidden className="size-3.5" /></span>
          </button>
        ))}
      </div>
    </section>
  );
}
