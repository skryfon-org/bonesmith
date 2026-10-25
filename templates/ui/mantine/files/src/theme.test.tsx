import { Button, MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { theme } from "./theme";

describe("theme", () => {
  it("renders Mantine components inside the app theme", () => {
    render(
      <MantineProvider theme={theme}>
        <Button>Save</Button>
      </MantineProvider>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
