import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
  it("renders a labelled region with its title and content", () => {
    render(<Card title="Hello">Body</Card>);
    const region = screen.getByRole("region", { name: "Hello" });
    expect(region).toHaveTextContent("Body");
    expect(screen.getByRole("heading", { level: 2, name: "Hello" })).toBeInTheDocument();
  });
});
