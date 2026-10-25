---
inclusion: fileMatch
fileMatchPattern: "src/store/**"
---

# State: Redux Toolkit

- `configureStore` in `src/store/index.ts` via `makeStore()`; `RootState` / `AppDispatch` are derived from it, never written by hand.
- One `createSlice` per feature in `src/store/<feature>Slice.ts`; reducers "mutate" draft state (Immer).
- Components use the typed hooks from `src/store/hooks.ts` (`useAppSelector`, `useAppDispatch`), not the plain react-redux hooks.
- Async work: `createAsyncThunk`, or RTK Query (`createApi`) for server data.
- Test slices against a fresh `makeStore()`; render connected components inside `<Provider store={makeStore()}>`.
