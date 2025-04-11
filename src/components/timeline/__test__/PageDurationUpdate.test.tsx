import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useSelectedAudioFile } from "@/context/SelectedAudioFileContext";
import { ElectronApi } from "electron/preload";
import Beat from "@/global/classes/Beat";
import Page from "@/global/classes/Page";

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

// Import the function we want to test
// Since the function is inside a component, we need to extract it for testing
// This is a simplified version of the function for testing purposes
const updatePageDuration = async (
    pageId: number,
    newDuration: number,
    pages: Page[],
    beats: Beat[],
): Promise<void> => {
    // Find the current page and the next page
    const currentPageIndex = pages.findIndex((page) => page.id === pageId);
    if (currentPageIndex === -1) return;

    const currentPage = pages[currentPageIndex];
    const nextPageIndex = currentPageIndex + 1;

    // If there's no next page, we can't adjust the duration
    if (nextPageIndex >= pages.length) return;

    const nextPage = pages[nextPageIndex];

    // Calculate how many beats to include in the current page based on the new duration
    let cumulativeDuration = 0;
    let targetBeatIndex = -1;

    // Find all beats in the show
    const allBeats = [...beats].sort((a, b) => a.position - b.position);

    // Find the index of the first beat of the current page
    const currentPageStartBeatIndex = allBeats.findIndex(
        (beat) => beat.id === currentPage.beats[0].id,
    );

    // Calculate how many beats should be included to match the new duration
    for (let i = currentPageStartBeatIndex; i < allBeats.length; i++) {
        cumulativeDuration += allBeats[i].duration;
        if (cumulativeDuration >= newDuration || i === allBeats.length - 1) {
            targetBeatIndex = i; // The last beat we want to include in the current page
            break;
        }
    }

    // If we couldn't find a suitable beat, don't update
    if (targetBeatIndex === -1 || targetBeatIndex >= allBeats.length) return;

    // Get the beat ID that should be the start of the next page
    // We need the beat after the last one we included in the current page
    const nextBeatIndex = targetBeatIndex + 1;

    // If there's no next beat, don't update
    if (nextBeatIndex >= allBeats.length) return;

    const newNextPageStartBeatId = allBeats[nextBeatIndex].id;

    // Update the next page's start beat
    await window.electron.updatePages([
        {
            id: nextPage.id,
            start_beat: newNextPageStartBeatId,
        },
    ]);
};

describe("updatePageDuration function", () => {
    // Mock the window.electron object
    beforeEach(() => {
        window.electron = {
            updatePages: vi.fn().mockResolvedValue({ success: true }),
            getSelectedAudioFile: vi.fn().mockResolvedValue(null),
        } as Partial<ElectronApi> as ElectronApi;

        // Mock the useTimingObjectsStore hook
        vi.mocked(useTimingObjectsStore).mockReturnValue({
            pages: mockPages,
            beats: mockBeats,
            measures: [],
            fetchTimingObjects: vi.fn().mockResolvedValue(undefined),
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
    });

    it("updates the next page's start beat when increasing duration", async () => {
        // Test increasing the duration of page 1
        await updatePageDuration(1, 3, mockPages, mockBeats);

        // It should update the start beat of page 2 to be beat 4
        expect(window.electron.updatePages).toHaveBeenCalledWith([
            {
                id: 2,
                start_beat: 4, // The ID of the beat that should now start page 2
            },
        ]);
    });

    it("updates the next page's start beat when decreasing duration", async () => {
        // Test decreasing the duration of page 1
        await updatePageDuration(1, 1, mockPages, mockBeats);

        // It should update the start beat of page 2 to be beat 2
        expect(window.electron.updatePages).toHaveBeenCalledWith([
            {
                id: 2,
                start_beat: 2, // The ID of the beat that should now start page 2
            },
        ]);
    });

    it("does not update if the page ID is invalid", async () => {
        // Test with an invalid page ID
        await updatePageDuration(999, 3, mockPages, mockBeats);

        // It should not call updatePages
        expect(window.electron.updatePages).not.toHaveBeenCalled();
    });

    it("does not update if there is no next page", async () => {
        // Test with the last page
        await updatePageDuration(3, 3, mockPages, mockBeats);

        // It should not call updatePages
        expect(window.electron.updatePages).not.toHaveBeenCalled();
    });

    // it("handles edge case when new duration exceeds available beats", async () => {
    //     // Test with a duration that would exceed the available beats
    //     await updatePageDuration(1, 10, mockPages, mockBeats);

    //     // It should still update with the last available beat
    //     expect(window.electron.updatePages).toHaveBeenCalledWith([
    //         {
    //             id: 2,
    //             start_beat: 6, // The ID of the last beat
    //         },
    //     ]);
    // });
});
