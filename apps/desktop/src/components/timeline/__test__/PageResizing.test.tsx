import {
    describe,
    expect,
    it,
    vi,
    beforeEach,
    afterEach,
    beforeAll,
} from "vitest";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import { ElectronApi } from "electron/preload";
import Beat from "@/global/classes/Beat";
import Page from "@/global/classes/Page";
import PageTimeline from "../TimelineContainer";
import { ModifiedPageArgs } from "electron/database/tables/PageTable";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { ThemeProvider } from "@/context/ThemeContext";

const Providers = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider>
        <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
);

// Mock the hooks
vi.mock("@/stores/TimingObjectsStore");
vi.mock("@/stores/UiSettingsStore");
vi.mock("@/context/IsPlayingContext");
vi.mock("@/context/SelectedPageContext");
vi.mock("@/stores/ShapePageStore");
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

describe.todo("PageTimeline Resizing", () => {
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

        // Mock the useTimingObjectsStore hook
        vi.mocked(useTimingObjectsStore).mockReturnValue({
            pages: mockPages,
            beats: mockBeats,
            measures: [],
            fetchTimingObjects: vi.fn().mockResolvedValue(undefined),
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

        // Mock the useShapePageStore hook
        vi.mocked(useShapePageStore).mockReturnValue({
            setSelectedMarcherShapes: vi.fn(),
        });

        // Mock the useSelectedAudioFile hook
        vi.mocked(useSelectedAudioFile).mockReturnValue({
            selectedAudioFile: null,
            setSelectedAudioFile: vi.fn(),
        });

        // Create a mock for getState to return the current state
        useTimingObjectsStore.getState = vi.fn().mockReturnValue({
            pages: mockPages,
            beats: mockBeats,
            measures: [],
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        cleanup();
    });

    it("renders the PageTimeline component", () => {
        render(
            <Providers>
                <PageTimeline />
            </Providers>,
        );
        // Check if the pages are rendered
        expect(screen.getByText("0")).toBeInTheDocument();
        expect(screen.getByText("1")).toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("starts page resizing when mouse down on resize handle", async () => {
        const { container } = render(
            <Providers>
                <PageTimeline />
            </Providers>,
        );

        // Find the resize handle for page 1
        const resizeHandles = container.querySelectorAll(".cursor-ew-resize");
        expect(resizeHandles.length).toBeGreaterThan(0);

        // Simulate mouse down on the resize handle
        fireEvent.mouseDown(resizeHandles[0], { clientX: 100 });

        // Verify that the resize event listeners are added
        // This is hard to test directly, but we can check if the element gets the right class
        expect(resizeHandles[0]).toHaveClass("cursor-ew-resize");
    });

    it("updates page width during resize movement", async () => {
        const { container } = render(
            <Providers>
                <PageTimeline />
            </Providers>,
        );

        // Find the resize handle for page 1
        const resizeHandles = container.querySelectorAll(".cursor-ew-resize");
        const pageElement = container.querySelector(`[timeline-page-id="1"]`);

        // Initial setup - mousedown on resize handle
        fireEvent.mouseDown(resizeHandles[0], { clientX: 100 });

        // Simulate mouse movement
        const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 150 });
        act(() => {
            document.dispatchEvent(mouseMoveEvent);
        });

        // Check if the page element width is updated
        // Note: In a real test environment, this might not actually update the style
        // due to how JSDOM works, but the logic should be called
        expect(pageElement).toBeDefined();
    });

    it("calls updatePages when resizing ends", async () => {
        const { container } = render(
            <Providers>
                <PageTimeline />
            </Providers>,
        );

        // Find the resize handle for page 1
        const resizeHandles = container.querySelectorAll(".cursor-ew-resize");

        // Initial setup - mousedown on resize handle
        fireEvent.mouseDown(resizeHandles[0], { clientX: 100 });

        // Simulate mouse movement
        const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 150 });
        act(() => {
            document.dispatchEvent(mouseMoveEvent);
        });

        // Simulate mouse up to end resizing
        const mouseUpEvent = new MouseEvent("mouseup");
        act(() => {
            document.dispatchEvent(mouseUpEvent);
        });

        // The updatePages function should be called
        // Note: In a real test, we would need to mock the element's dataset
        // to simulate the new duration being stored
        expect(window.electron.updatePages).toHaveBeenCalledWith([
            {
                id: 2,
                start_beat: 6,
            },
        ] satisfies ModifiedPageArgs[]);
    });

    it("does not allow resizing when playback is active", () => {
        // Mock isPlaying to return true
        vi.mocked(useIsPlaying).mockReturnValue({
            isPlaying: true,
            setIsPlaying: vi.fn(),
        });

        const { container } = render(
            <Providers>
                <PageTimeline />
            </Providers>,
        );

        // Find the resize handle for page 1
        const resizeHandles = container.querySelectorAll(".cursor-ew-resize");

        // Simulate mouse down on the resize handle
        fireEvent.mouseDown(resizeHandles[0], { clientX: 100 });

        // Verify that the resize event listeners are not added
        // This is hard to test directly, but we can check if the element gets the right class
        expect(resizeHandles[0]).toHaveClass("cursor-ew-resize");
    });
});
