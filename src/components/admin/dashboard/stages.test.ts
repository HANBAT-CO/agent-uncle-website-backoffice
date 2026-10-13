import { describe, expect, it } from "vitest";

import { REQUEST_LABELS } from "@/lib/admin/labels";

import { STAGE_KEYS, toStages } from "./stages";

describe("toStages", () => {
  it("folds request labels into the four stages and counts 종료 apart (tasks appendix WP-05)", () => {
    const stages = toStages({ "확인 대기": 2, "답변 필요": 1, "미송 재확인": 1, "수령 대기": 3, 완료: 4, 거절: 1, "취소 종료": 2 });
    expect(stages.map((stage) => [stage.key, stage.count])).toEqual([
      ["확인 대기", 2],
      ["진행 중", 2],
      ["수령 대기", 3],
      ["완료", 4],
    ]);
    expect(stages.ended).toBe(3);
  });

  it("puts every in-progress label of screens 10.5 into 진행 중", () => {
    const stages = toStages({
      "진행 중": 1,
      "픽업 완료": 1,
      "미송 대기": 1,
      "미송 재확인": 1,
      "답변 필요": 1,
      "변경·취소 협의 중": 1,
      "문제 확인 중": 1,
    });
    expect(stages.find((stage) => stage.key === "진행 중")?.count).toBe(7);
    expect(stages.ended).toBe(0);
  });

  it("returns all four stages in order with zeros for an empty map", () => {
    const stages = toStages({});
    expect(stages.map((stage) => stage.key)).toEqual([...STAGE_KEYS]);
    expect(stages.every((stage) => stage.count === 0)).toBe(true);
    expect(stages.ended).toBe(0);
  });

  it("covers every request label exactly once (stages or 종료)", () => {
    const labels = Object.fromEntries(REQUEST_LABELS.map((label) => [label, 1]));
    const stages = toStages(labels);
    const counted = stages.reduce((sum, stage) => sum + stage.count, 0) + stages.ended;
    expect(counted).toBe(REQUEST_LABELS.length);
  });

  it("ignores unknown labels and non-positive or non-finite counts", () => {
    const stages = toStages({ "알 수 없음": 5, "확인 대기": -1, 완료: Number.NaN, "수령 대기": 2 });
    expect(stages.map((stage) => stage.count)).toEqual([0, 0, 2, 0]);
  });
});
