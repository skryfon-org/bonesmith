import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// bonesmith:imports

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element in index.html");

createRoot(root).render(
  <StrictMode>
    {/* bonesmith:providers-open */}
    <App />
    {/* bonesmith:providers-close */}
  </StrictMode>,
);
