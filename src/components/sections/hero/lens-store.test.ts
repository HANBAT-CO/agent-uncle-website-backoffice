import { afterEach, describe, expect, it, vi } from "vitest";

import { lensStore, REST_BUILDING } from "./lens-store";

afterEach(() => lensStore.reset());

describe("lensStore (S1 lens and chips)", () => {
  it("rests on 청평화", () => {
    expect(REST_BUILDING).toBe("cheongpyeonghwa");
    expect(lensStore.getState()).toMatchObject({ selected: "cheongpyeonghwa", shown: "cheongpyeonghwa" });
    expect(lensStore.getServerState()).toEqual(lensStore.getState());
  });

  it("select moves both the selection and the readout, and asks the lens to move", () => {
    const before = lensStore.getState().request;
    lensStore.select("apm");
    expect(lensStore.getState()).toMatchObject({ selected: "apm", shown: "apm", request: before + 1 });
  });

  it("selecting the same building again still asks the lens to move (focus after a hover)", () => {
    lensStore.select("apm");
    lensStore.show("diot");
    const request = lensStore.getState().request;
    lensStore.select("apm");
    expect(lensStore.getState()).toMatchObject({ selected: "apm", shown: "apm", request: request + 1 });
  });

  it("show changes only the readout; null hides it", () => {
    lensStore.show("nampyeonghwa");
    expect(lensStore.getState()).toMatchObject({ selected: "cheongpyeonghwa", shown: "nampyeonghwa" });
    lensStore.show(null);
    expect(lensStore.getState().shown).toBeNull();
  });

  it("rest returns the readout to the selected building", () => {
    lensStore.select("diot");
    lensStore.show(null);
    lensStore.rest();
    expect(lensStore.getState().shown).toBe("diot");
  });

  it("notifies only on change", () => {
    const listener = vi.fn();
    const unsubscribe = lensStore.subscribe(listener);
    lensStore.show("cheongpyeonghwa");
    expect(listener).not.toHaveBeenCalled();
    lensStore.show("apm");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    lensStore.show("diot");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
