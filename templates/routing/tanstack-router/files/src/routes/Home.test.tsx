import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { routeTree } from "../router";

describe("Home route", () => {
  it("renders the project heading at /", async () => {
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("heading", { level: 1, name: "{{name}}" })).toBeInTheDocument();
  });
});
