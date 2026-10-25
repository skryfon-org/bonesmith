import { createSlice } from "@reduxjs/toolkit";

export interface CounterState {
  value: number;
}

const initialState: CounterState = { value: 0 };

const counterSlice = createSlice({
  name: "counter",
  initialState,
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
    reset: () => initialState,
  },
});

export const { increment, reset } = counterSlice.actions;
export const counterReducer = counterSlice.reducer;
