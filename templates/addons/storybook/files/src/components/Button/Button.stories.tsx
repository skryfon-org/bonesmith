import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "./Button";

const meta = {
  component: Button,
  args: { children: "Save", onClick: fn() },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Save" }));
    await expect(args.onClick).toHaveBeenCalledOnce();
  },
};

export const Secondary: Story = { args: { variant: "secondary" } };

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "Save" })).toBeDisabled();
  },
};
