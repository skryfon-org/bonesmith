import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Card } from "./Card";

const meta = { component: Card, args: { title: "Card title", children: "Card content" } } satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole("region", { name: "Card title" });
    await expect(region).toHaveTextContent("Card content");
  },
};
