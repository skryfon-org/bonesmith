---
inclusion: fileMatch
fileMatchPattern: ["src/router.tsx", "src/routes/**"]
---

# Routing: TanStack Router

- Code-based route tree in `src/router.tsx`: `createRootRoute` → `createRoute({ getParentRoute, path, component })` → `rootRoute.addChildren([...])` → `createRouter({ routeTree })`. No file-based codegen.
- The `Register` module augmentation in `src/router.tsx` makes `<Link to>`, `useParams` and `useSearch` type-checked; keep it.
- One component per page in `src/routes/`; shared layout goes in the root route's `component` with `<Outlet />`.
- Validate search params with `validateSearch`; load data in the route's `loader` and read it with `Route.useLoaderData()`.
- Test with `createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/path"] }) })` and `findBy…` queries.
