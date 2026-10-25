import { createBrowserRouter } from "react-router";
import { Home } from "./routes/Home";

export const routes = [{ path: "/", element: <Home /> }];

export const router = createBrowserRouter(routes);
