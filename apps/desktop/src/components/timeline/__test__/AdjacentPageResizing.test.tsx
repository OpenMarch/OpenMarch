import {
    describe,
    expect,
    it,
    vi,
    beforeEach,
    afterEach,
    beforeAll,
} from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useTimingObjects } from "@/hooks";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import { ElectronApi } from "electron/preload";
import Beat from "@/global/classes/Beat";
import Page from "@/global/classes/Page";
import PageTimeline from "../TimelineContainer";
import { ThemeProvider } from "@/context/ThemeContext";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { TolgeeProvider } from "@tolgee/react";
import tolgee from "@/global/singletons/Tolgee";

// Mock the hooks
vi.mock("@/hooks");
vi.mock("@/stores/UiSettingsStore");
vi.mock("@/context/IsPlayingContext");
vi.mock("@/context/SelectedPageContext");
vi.mock("@/context/SelectedAudioFileContext");

// Create mock data
const mockBeats: Beat[] = [
    { id: 1, position: 10, duration: 1 } as Beat,
    { id: 2, position: 20, duration: 1 } as Beat,
    { id: 3, position: 30, duration: 1 } as Beat,
    { id: 4, position: 40, duration: 1 } as Beat,
    { id: 5, position: 50, duration: 1 } as Beat,
    { id: 6, position: 60, duration: 1 } as Beat,
];

const mockPages: Page[] = [
    {
        id: 0,
        name: "0",
        counts: 0,
        notes: null,
        order: 0,
        isSubset: false,
        duration: 0,
        beats: [mockBeats[0]],
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: 0,
        previousPageId: null,
        nextPageId: 1,
    } as Page,
    {
        id: 1,
        name: "1",
        counts: 2,
        notes: null,
        order: 1,
        isSubset: false,
        duration: 2,
        beats: [mockBeats[0], mockBeats[1]],
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: 0,
        previousPageId: 0,
        nextPageId: 2,
    } as Page,
    {
        id: 2,
        name: "2",
        counts: 2,
        notes: null,
        order: 2,
        isSubset: false,
        duration: 2,
        beats: [mockBeats[2], mockBeats[3]],
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: 2,
        previousPageId: 1,
        nextPageId: 3,
    } as Page,
    {
        id: 3,
        name: "3",
        counts: 2,
        notes: null,
        order: 3,
        isSubset: false,
        duration: 2,
        beats: [mockBeats[4], mockBeats[5]],
        measures: null,
        measureBeatToStartOn: null,
        measureBeatToEndOn: null,
        timestamp: 4,
        previousPageId: 2,
        nextPageId: null,
    } as Page,
];

const Providers = ({ children }: { children: React.ReactNode }) => (
    <TolgeeProvider
        tolgee={tolgee}
        fallback="Loading..." // loading fallback
    >
        <ThemeProvider>
            <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
    </TolgeeProvider>
);

describe.todo("Adjacent Page Resizing", () => {
    beforeAll(() => {
        window.matchMedia = vi.fn().mockImplementation((query) => {
            return {
                matches: query === "(prefers-color-scheme: light)",
                media: query,
                onchange: null,
            };
        });
    });
    // Mock the window.electron object
    beforeEach(() => {
        window.electron = {
            updatePages: vi.fn().mockResolvedValue({ success: true }),
            getSelectedAudioFile: vi.fn().mockResolvedValue(null),
            setTheme: vi.fn(),
            getTheme: vi.fn().mockResolvedValue(null),
        } as Partial<ElectronApi> as ElectronApi;

        // Mock the useTimingObjects hook
        vi.mocked(useTimingObjects).mockReturnValue({
            pages: mockPages,
            beats: mockBeats,
            measures: [],
            fetchTimingObjects: vi.fn().mockResolvedValue(undefined),
            isLoading: false,
            hasError: false,
        });

        // Mock the useUiSettingsStore hook
        vi.mocked(useUiSettingsStore).mockReturnValue({
            uiSettings: {
                timelinePixelsPerSecond: 100,
            },
            setPixelsPerSecond: vi.fn(),
        });

        // Mock the useIsPlaying hook
        vi.mocked(useIsPlaying).mockReturnValue({
            isPlaying: false,
            setIsPlaying: vi.fn(),
        });

        // Mock the useSelectedPage hook
        vi.mocked(useSelectedPage).mockReturnValue({
            selectedPage: mockPages[1],
            setSelectedPage: vi.fn(),
        });

        // Mock the useSelectedAudioFile hook
        vi.mocked(useSelectedAudioFile).mockReturnValue({
            selectedAudioFile: null,
            setSelectedAudioFile: vi.fn(),
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        cleanup();
    });

    it("updates both current and next page widths during resize", async () => {
        const { container } = render(
            <Providers>
                <PageTimeline />
            </Providers>,
        );

        // Find the resize handle for page 1
        const resizeHandles = container.querySelectorAll(".cursor-ew-resize");
        expect(resizeHandles.length).toBeGreaterThan(0);

        // Get the page elements
        const page1Element = container.querySelector(`[timeline-page-id="1"]`);
        const page2Element = container.querySelector(`[timeline-page-id="2"]`);

        // Store initial widths
        const initialPage1Width = (page1Element as HTMLElement)?.style.width;
        const initialPage2Width = (page2Element as HTMLElement)?.style.width;

        // Initial setup - mousedown on resize handle
        fireEvent.mouseDown(resizeHandles[0], { clientX: 100 });

        // Simulate mouse movement to the right (increasing page 1 width)
        const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 250 });
        act(() => {
            document.dispatchEvent(mouseMoveEvent);
        });

        // Check if both page widths are updated
        // Page 1 should be wider, Page 2 should be narrower
        expect((page1Element as HTMLElement)?.style.width).not.toEqual(
            initialPage1Width,
        );
        expect((page2Element as HTMLElement)?.style.width).not.toEqual(
            initialPage2Width,
        );

        // Simulate mouse up to end resizing
        const mouseUpEvent = new MouseEvent("mouseup");
        act(() => {
            document.dispatchEvent(mouseUpEvent);
        });

        // The updatePages function should be called
        // Note: In the new query style, this would be tested through the mutation hook
        // expect(window.electron.updatePages).toHaveBeenCalled();
    });

    it("ensures next page width doesn't go below minimum when dragging", async () => {
        const { container } = render(
            <Providers>
                <PageTimeline />
            </Providers>,
        );

        // Find the resize handle for page 1
        const resizeHandles = container.querySelectorAll(".cursor-ew-resize");

        // Get the page elements
        const page2Element = container.querySelector(`[timeline-page-id="2"]`);

        // Initial setup - mousedown on resize handle
        fireEvent.mouseDown(resizeHandles[0], { clientX: 100 });

        // Simulate a large mouse movement to the right (which would make page 2 too small)
        const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 300 });
        act(() => {
            document.dispatchEvent(mouseMoveEvent);
        });

        // Check if page 2 width is at least the minimum (100px)
        expect((page2Element as HTMLElement)?.style.width).toBeDefined();
        const page2Width = (page2Element as HTMLElement)?.style.width;
        const numericWidth = parseInt(page2Width?.replace("px", "") || "0");
        expect(numericWidth).toBeGreaterThanOrEqual(100);

        // Simulate mouse up to end resizing
        const mouseUpEvent = new MouseEvent("mouseup");
        act(() => {
            document.dispatchEvent(mouseUpEvent);
        });
    });
});
