---
inclusion: fileMatch
fileMatchPattern: "src/stores/**"
---

# State: Zustand

- One store per domain in `src/stores/<domain>.ts`, exported as `use<Domain>Store`, created with `create<State>()((set, get) => ({ … }))`.
- Keep state and its actions together in the store; components call actions, never `setState` directly.
- Select only what a component needs: `useCounterStore((s) => s.count)`. Use `useShallow` when selecting several fields.
- Server data (fetching, caching) doesn't belong in a store; keep stores for client state.
- Test stores through `useXStore.getState()` and reset them in `beforeEach`.
