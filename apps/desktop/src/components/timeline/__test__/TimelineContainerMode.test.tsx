import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { TolgeeProvider } from "@tolgee/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";
import { describeDbTests, type DbConnection, schema } from "@/test/base";
import { transactionWithHistory } from "@/db-functions/history";
import {
    getWorkspaceSettingsParsed,
    updateWorkspaceSettingsParsed,
} from "@/db-functions/workspaceSettings";
import tolgee from "@/global/singletons/Tolgee";
import { ThemeProvider } from "@/context/ThemeContext";
import TimelineContainer from "../TimelineContainer";

/**
 * The 0.2 timeline (P8.1) replaces the page timeline only for a file whose timeline dev flag is
 * on. With the flag off, the container renders the page timeline exactly as before.
 */

afterEach(cleanup);

// The Electron bridge calls that the container's theme and audio providers and the history log
// make.
beforeEach(() => {
    // The db fixture adds sqlProxy to this object when the test starts
    window.electron = Object.assign(window.electron ?? {}, {
        log: vi.fn(),
        getTheme: vi.fn().mockResolvedValue(null),
        setTheme: vi.fn(),
        getSelectedAudioFile: vi.fn().mockResolvedValue(null),
    });
    window.matchMedia ??= vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    }));
});

const setTimelineMode = async (db: DbConnection, on: boolean) => {
    const settings = await getWorkspaceSettingsParsed({ db });
    await updateWorkspaceSettingsParsed({
        db,
        settings: { ...settings, timelineMode: on },
    });
};

const renderContainer = (wrapper: ComponentType<{ children: ReactNode }>) => {
    const Wrapper = wrapper;
    return render(
        <Wrapper>
            <TolgeeProvider tolgee={tolgee} fallback="Loading...">
                <ThemeProvider>
                    <TimelineContainer />
                </ThemeProvider>
            </TolgeeProvider>
        </Wrapper>,
    );
};

describeDbTests("TimelineContainer and the timeline flag", (it) => {
    describe("flag off", () => {
        it("renders the page timeline and not the new timeline", async ({
            wrapper,
        }) => {
            const { container } = renderContainer(wrapper);

            await waitFor(
                () =>
                    expect(container.querySelector("#timeline")).not.toBeNull(),
                { timeout: 5000 },
            );
            // Page mode keeps the legacy waveform
            expect(container.querySelector("#waveform")).not.toBeNull();
            expect(
                screen.queryByTestId("timeline-mode-container"),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByTestId("timeline-viewport"),
            ).not.toBeInTheDocument();
        });
    });

    describe("flag on", () => {
        it("renders the new timeline instead of the page timeline", async ({
            db,
            wrapper,
        }) => {
            await setTimelineMode(db, true);
            const { container } = renderContainer(wrapper);

            await waitFor(
                () =>
                    expect(
                        screen.getByTestId("timeline-mode-container"),
                    ).toBeInTheDocument(),
                { timeout: 5000 },
            );
            expect(screen.getByTestId("timeline-viewport")).toBeInTheDocument();
            expect(container.querySelector("#timeline")).toBeNull();
            // The audio player runs headless: no legacy waveform or beat markers behind the timeline
            expect(container.querySelector("#waveform")).toBeNull();
            // No tracks until the view-model adapter (P8.8)
            expect(screen.queryByLabelText(/ timeline, beats /)).toBeNull();
            // The transport is the timeline's header row; fullscreen is on the field's zoom
            // widget now (UI-12), and Sound and Compact are in the row
            expect(
                screen.getByRole("group", { name: "Transport" }),
            ).toBeInTheDocument();
            expect(screen.getByTestId("timeline-sound")).toBeInTheDocument();
            expect(screen.getByTestId("timeline-compact")).toBeInTheDocument();
        });

        it("selects the page clicked in the ruler", async ({ db, wrapper }) => {
            // Beats 1..16 after the fixed beat 0; page 1 starts at beat 1 and page 2 at beat 9
            await transactionWithHistory(db, "seedShow", async (tx) => {
                await tx.insert(schema.beats).values(
                    Array.from({ length: 16 }, (_, i) => ({
                        id: i + 1,
                        position: i + 1,
                        duration: 0.5,
                    })),
                );
                await tx.insert(schema.pages).values([
                    { id: 1, start_beat: 1 },
                    { id: 2, start_beat: 9 },
                ]);
            });
            await setTimelineMode(db, true);
            renderContainer(wrapper);

            const page2 = await screen.findByRole(
                "button",
                { name: "Page 2" },
                { timeout: 5000 },
            );
            fireEvent.click(page2);

            // The ruler also seeks to beat 9, which alone would select page 1 (it ends there)
            await waitFor(() =>
                expect(
                    screen.getByRole("group", { name: "Transport" }),
                ).toHaveTextContent("Pg 2"),
            );
            expect(page2).toHaveAttribute("aria-pressed", "true");
        });
    });
});
