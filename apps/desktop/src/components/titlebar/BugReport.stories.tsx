import type { Meta, StoryObj } from "@storybook/react-vite";
import BugReport from "./BugReport";

const meta: Meta<typeof BugReport> = {
    title: "Titlebar/BugReport",
    component: BugReport,
};

export default meta;

type Story = StoryObj<typeof BugReport>;

export const Default: Story = {};
