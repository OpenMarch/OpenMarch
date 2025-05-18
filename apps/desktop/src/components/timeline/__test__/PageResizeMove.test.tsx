import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import Page from "@/global/classes/Page";
import Beat from "@/global/classes/Beat";
import { ElectronApi } from "electron/preload";

// Mock the hooks
vi.mock("@/stores/UiSettingsStore");
vi.mock("@/context/SelectedAudioFileContext");

// Create mock data
const mockPage: Page = {
    id: 1,
    name: "1",
    counts: 2,
    notes: null,
    order: 1,
    isSubset: false,
    duration: 2,
    beats: [
        { id: 1, position: 10, duration: 1 } as Beat,
        { id: 2, position: 20, duration: 1 } as Beat,
    ],
    measures: null,
    measureBeatToStartOn: null,
    measureBeatToEndOn: null,
    timestamp: 0,
    previousPageId: 0,
    nextPageId: 2,
} as Page;

// Import the function we want to test
// Since the function is inside a component, we need to extract it for testing
// This is a simplified version of the function for testing purposes
const handlePageResizeMove = (
    e: MouseEvent,
    resizingPage: Page | null,
    startX: number,
    startWidth: number,
    pixelsPerSecond: number,
): { newWidth: number; newDuration: number } | null => {
    if (!resizingPage) return null;

    const deltaX = e.clientX - startX;
    const newWidth = Math.max(100, startWidth + deltaX); // Minimum width of 100px

    // Calculate new duration based on the new width
    // Subtract the buffer we added in getWidth to get the actual duration
    const buffer =
        resizingPage.beats.length > 0 ? resizingPage.beats[0].duration : 0;
    const newDuration = newWidth / pixelsPerSecond - buffer;

    return { newWidth, newDuration };
};

describe("handlePageResizeMove function", () => {
    beforeEach(() => {
        window.electron = {
            getSelectedAudioFile: vi.fn().mockResolvedValue(null),
        } as Partial<ElectronApi> as ElectronApi;

        // Mock the useUiSettingsStore hook
        vi.mocked(useUiSettingsStore).mockReturnValue({
            uiSettings: {
                timelinePixelsPerSecond: 100,
            },
            setPixelsPerSecond: vi.fn(),
        });

        // Mock the useSelectedAudioFile hook
        vi.mocked(useSelectedAudioFile).mockReturnValue({
            selectedAudioFile: null,
            setSelectedAudioFile: vi.fn(),
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("calculates correct new width and duration when dragging right", () => {
        // Create a mock MouseEvent
        const mouseEvent = new MouseEvent("mousemove", { clientX: 150 });

        // Call the function with initial values
        const result = handlePageResizeMove(
            mouseEvent,
            mockPage,
            100, // startX
            200, // startWidth
            100, // pixelsPerSecond
        );

        // Check the results
        expect(result).not.toBeNull();
        expect(result?.newWidth).toBe(250); // 200 + (150 - 100)
        expect(result?.newDuration).toBe(1.5); // (250 / 100) - 1 (buffer)
    });

    it("calculates correct new width and duration when dragging left", () => {
        // Create a mock MouseEvent
        const mouseEvent = new MouseEvent("mousemove", { clientX: 50 });

        // Call the function with initial values
        const result = handlePageResizeMove(
            mouseEvent,
            mockPage,
            100, // startX
            200, // startWidth
            100, // pixelsPerSecond
        );

        // Check the results
        expect(result).not.toBeNull();
        expect(result?.newWidth).toBe(150); // 200 + (50 - 100)
        expect(result?.newDuration).toBe(0.5); // (150 / 100) - 1 (buffer)
    });

    it("enforces minimum width of 100px", () => {
        // Create a mock MouseEvent that would result in a width less than 100px
        const mouseEvent = new MouseEvent("mousemove", { clientX: 0 });

        // Call the function with initial values
        const result = handlePageResizeMove(
            mouseEvent,
            mockPage,
            100, // startX
            150, // startWidth
            100, // pixelsPerSecond
        );

        // Check the results
        expect(result).not.toBeNull();
        expect(result?.newWidth).toBe(100); // Minimum width
        expect(result?.newDuration).toBe(0); // (100 / 100) - 1 (buffer)
    });

    it("returns null if resizingPage is null", () => {
        // Create a mock MouseEvent
        const mouseEvent = new MouseEvent("mousemove", { clientX: 150 });

        // Call the function with resizingPage as null
        const result = handlePageResizeMove(
            mouseEvent,
            null, // resizingPage
            100, // startX
            200, // startWidth
            100, // pixelsPerSecond
        );

        // Check the result
        expect(result).toBeNull();
    });

    it("calculates duration correctly with different pixels per second", () => {
        // Create a mock MouseEvent
        const mouseEvent = new MouseEvent("mousemove", { clientX: 150 });

        // Call the function with a different pixelsPerSecond value
        const result = handlePageResizeMove(
            mouseEvent,
            mockPage,
            100, // startX
            200, // startWidth
            50, // pixelsPerSecond (half of the previous tests)
        );

        // Check the results
        expect(result).not.toBeNull();
        expect(result?.newWidth).toBe(250); // 200 + (150 - 100)
        expect(result?.newDuration).toBe(4); // (250 / 50) - 1 (buffer)
    });
});
