import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";
import TitleBar from "../TitleBar";
import type { UpdateState } from "@/global/updates";

const availableState: UpdateState = {
    currentVersion: "0.2.0",
    channel: "stable",
    phase: { kind: "available", version: "0.2.1" },
    needsMoveToApplications: false,
    automaticDownload: false,
};

/** The desktop updater's preload API, answering with `state` */
const updaterWith = (state: UpdateState) => {
    const updates = {
        getState: vi.fn().mockResolvedValue(state),
        onState: vi.fn(() => () => {}),
        check: vi.fn(),
        download: vi.fn(),
        install: vi.fn(),
        moveToApplications: vi.fn(),
    };
    Object.assign(window.electron, { updates });
    return updates;
};

beforeEach(() => {
    Object.assign(window, {
        electron: {
            isMacOS: true,
            getZoomFactor: () => 1,
            databaseGetPath: vi.fn().mockResolvedValue("/shows/Halftime.dots"),
        },
    });
});

const renderBar = (props: Parameters<typeof TitleBar>[0] = {}) =>
    render(
        <TolgeeProvider tolgee={tolgee} fallback="">
            <TitleBar {...props} />
        </TolgeeProvider>,
    );

describe("TitleBar", () => {
    it("lays out leading, path and trailing as grid columns so they can't overlap", async () => {
        renderBar();
        const path = await screen.findByText("Halftime.dots");
        expect(path).toHaveClass("truncate");
        expect(path.closest(".main-app-titlebar")).toHaveClass("grid");
    });

    it("settings variant hides the file path", async () => {
        renderBar({ variant: "settings" });
        // Let any async path fetch settle before asserting it never showed up.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(window.electron.databaseGetPath).not.toHaveBeenCalled();
        expect(screen.queryByText("Halftime.dots")).not.toBeInTheDocument();
    });

    it("settings variant shows no update pill", async () => {
        const updates = updaterWith(availableState);
        renderBar({ variant: "settings" });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(updates.getState).not.toHaveBeenCalled();
        expect(screen.queryByTestId("update-pill")).not.toBeInTheDocument();
    });

    it("main variant shows the updater's found update", async () => {
        updaterWith(availableState);
        renderBar();
        const pill = await screen.findByTestId("update-pill");
        expect(pill).toHaveAttribute("data-phase", "available");
    });

    it("main variant shows an automatic download as a quiet progress ring", async () => {
        updaterWith({
            ...availableState,
            phase: {
                kind: "downloading",
                version: "0.2.1",
                requested: false,
                percent: 37.4,
                bytesPerSecond: 1,
                transferred: 1,
                total: 2,
            },
        });
        renderBar();
        const pill = await screen.findByTestId("update-pill");
        expect(pill).toHaveAttribute("data-quiet", "true");
        expect(pill).toHaveAccessibleName("Downloading an update: 37%");
        expect(screen.getByTestId("update-progress-ring")).toBeInTheDocument();
    });

    it("main variant shows nothing while up to date", async () => {
        const updates = updaterWith({
            ...availableState,
            phase: { kind: "upToDate", checkedAt: 0 },
        });
        renderBar();
        await vi.waitFor(() => expect(updates.getState).toHaveBeenCalled());
        expect(screen.queryByTestId("update-pill")).not.toBeInTheDocument();
    });
});
