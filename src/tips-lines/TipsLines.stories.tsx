import type { Meta, StoryObj } from "@storybook/react-vite";
import { TipsLines } from "./index";

const meta: Meta<typeof TipsLines> = {
  title: "TipsLines",
  component: TipsLines,
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof TipsLines>;

export const Default: Story = {};

