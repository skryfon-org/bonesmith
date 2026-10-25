import { beforeEach, describe, expect, it } from "vitest";
import { useCounterStore } from "./counter";

describe("counter store", () => {
  beforeEach(() => {
    useCounterStore.getState().reset();
  });

  it("increments and resets", () => {
    useCounterStore.getState().increment();
    useCounterStore.getState().increment();
    expect(useCounterStore.getState().count).toBe(2);
    useCounterStore.getState().reset();
    expect(useCounterStore.getState().count).toBe(0);
  });
});
