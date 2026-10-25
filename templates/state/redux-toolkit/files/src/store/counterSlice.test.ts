import { describe, expect, it } from "vitest";
import { increment, reset } from "./counterSlice";
import { makeStore } from "./index";

describe("counter slice", () => {
  it("increments and resets", () => {
    const store = makeStore();
    store.dispatch(increment());
    store.dispatch(increment());
    expect(store.getState().counter.value).toBe(2);
    store.dispatch(reset());
    expect(store.getState().counter.value).toBe(0);
  });
});
