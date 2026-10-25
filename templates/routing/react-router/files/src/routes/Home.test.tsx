import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { routes } from "../router";

describe("Home route", () => {
  it("renders the project heading at /", async () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/"] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("heading", { level: 1, name: "{{name}}" })).toBeInTheDocument();
  });
});
