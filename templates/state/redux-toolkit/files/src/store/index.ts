import { configureStore } from "@reduxjs/toolkit";
import { counterReducer } from "./counterSlice";

export function makeStore() {
  return configureStore({ reducer: { counter: counterReducer } });
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
