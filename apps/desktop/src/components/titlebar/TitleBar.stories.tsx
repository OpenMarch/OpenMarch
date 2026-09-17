import type { Meta, StoryObj } from "@storybook/react-vite";
import TitleBar from "./TitleBar";

const meta: Meta<typeof TitleBar> = {
    title: "Titlebar/TitleBar",
    component: TitleBar,
    parameters: {
        layout: "fullscreen",
    },
};

export default meta;

type Story = StoryObj<typeof TitleBar>;

export const Default: Story = {
    args: {
        showControls: true,
    },
};

/** Renders the error dialog shown when the .dots file path can't be fetched from Electron. */
export const DatabasePathError: Story = {
    args: {
        showControls: true,
    },
    decorators: [
        (Story) => {
            window.electron.databaseGetPath = async () => {
                throw new Error("Failed to fetch database path");
            };
            return <Story />;
        },
    ],
};
