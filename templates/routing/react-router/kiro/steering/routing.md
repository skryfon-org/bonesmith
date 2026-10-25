---
inclusion: fileMatch
fileMatchPattern: ["src/router.tsx", "src/routes/**"]
---

# Routing: React Router v7

- Data router: routes are an array in `src/router.tsx` passed to `createBrowserRouter`; `App.tsx` renders `<RouterProvider>`.
- Import everything from `react-router` (v7 merged `react-router-dom` into it).
- One component per page in `src/routes/`; nested layouts use `children` + `<Outlet />`.
- Links: `<Link to="…">` / `<NavLink>`; navigate in code with `useNavigate`. Read params with `useParams`.
- Data loading belongs in route `loader`s, mutations in `action`s; read them with `useLoaderData` / `useActionData`.
- Test routes with `createMemoryRouter(routes, { initialEntries: ["/path"] })` and `findBy…` queries (routing renders asynchronously).
