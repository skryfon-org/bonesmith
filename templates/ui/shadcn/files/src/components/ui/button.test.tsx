import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("is an accessible button that handles clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders its child element with asChild", () => {
    render(
      <Button asChild>
        <a href="/docs">Docs</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute("data-slot", "button");
  });
});
