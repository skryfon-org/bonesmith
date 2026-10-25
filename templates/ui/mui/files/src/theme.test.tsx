import { Button, ThemeProvider } from "@mui/material";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { theme } from "./theme";

describe("theme", () => {
  it("renders MUI components inside the app theme", () => {
    render(
      <ThemeProvider theme={theme}>
        <Button variant="contained">Save</Button>
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
