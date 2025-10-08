import { describe, expect, it, vi, beforeEach } from "vitest";
import { EditableTimingMarkersPlugin } from "../audio/EditableTimingMarkersPlugin";
import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";

// Mock the window.electron object
vi.mock("electron", () => ({
    default: {},
}));

// Mock the window.electron.updateBeats function
const mockUpdateBeats = vi.fn();
vi.stubGlobal("window", {
    electron: {
        updateBeats: mockUpdateBeats,
    },
});

describe("EditableTimingMarkersPlugin", () => {
    // Mock data
    const mockBeats: Beat[] = [
        {
            id: 0,
            position: 0,
            duration: 0,
            includeInMeasure: true,
            notes: null,
            index: 0,
            timestamp: 0,
        },
        {
            id: 1,
            position: 1,
            duration: 1.0,
            includeInMeasure: true,
            notes: null,
            index: 1,
            timestamp: 0,
        },
        {
            id: 2,
            position: 1,
            duration: 2.0,
            includeInMeasure: true,
            notes: null,
            index: 1,
            timestamp: 2,
        },
    ];

    const mockMeasures: Measure[] = [
        {
            id: 1,
            startBeat: mockBeats[0],
            number: 1,
            rehearsalMark: null,
            notes: null,
            duration: 1.0,
            counts: 1,
            beats: [mockBeats[0]],
            timestamp: 0,
        },
    ];

    // Mock region event handlers
    const mockRegion = {
        on: vi.fn(),
        remove: vi.fn(),
        setOptions: vi.fn(),
        data: {},
    };

    // Mock WaveSurfer regions plugin
    const mockWsRegions = {
        addRegion: vi.fn().mockReturnValue(mockRegion),
    };

    // Mock fetchTimingObjects function
    const mockFetchTimingObjects = vi.fn().mockResolvedValue(undefined);

    let editableTimingMarkersPlugin: EditableTimingMarkersPlugin;

    beforeEach(() => {
        vi.clearAllMocks();
        editableTimingMarkersPlugin = new EditableTimingMarkersPlugin(
            mockWsRegions,
            mockBeats,
            mockMeasures,
            mockFetchTimingObjects,
            0.5, // defaultDuration in seconds
        );
    });

    describe("createTimingMarkers", () => {
        it("should create resizable beat regions", () => {
            editableTimingMarkersPlugin.createTimingMarkers();
            const expectedBeats = mockBeats.slice(1);

            // Should call addRegion for each beat and measure
            expect(mockWsRegions.addRegion).toHaveBeenCalledTimes(
                expectedBeats.length + mockMeasures.length,
            );
        });

        it("should create non-resizable measure regions", () => {
            editableTimingMarkersPlugin.createTimingMarkers();

            // Check that measure regions are created with resize=false
            let curTimestamp = 0;
            mockMeasures.forEach((measure) => {
                expect(mockWsRegions.addRegion).toHaveBeenCalledWith({
                    id: `${measure.rehearsalMark ? "rehearsalMark" : "editable-measure"} measure-${measure.id}`,
                    start: curTimestamp,
                    content: measure.number.toString(),
                    drag: false,
                    resize: false,
                });
                curTimestamp += measure.duration;
            });
        });
    });

    describe("handleBeatResized", () => {
        it("should update beat duration in the database", async () => {
            // Setup
            const mockRegion = {
                data: { beatId: 1, originalDuration: 1.0, index: 0 },
                start: 0,
                end: 1.5, // New end time (changed from 1.0)
                setOptions: vi.fn(),
            };

            // Mock successful database update
            mockUpdateBeats.mockResolvedValue({ success: true });

            // Call the private method directly
            // @ts-ignore - Accessing private method for testing
            await editableTimingMarkersPlugin.handleBeatResized(mockRegion);
        });

        it("should reset region if database update fails", async () => {
            // Setup
            const mockRegion = {
                data: { beatId: 1, originalDuration: 1.0, index: 0 },
                start: 0,
                end: 1.5, // New end time
                setOptions: vi.fn(),
            };

            // Mock failed database update
            mockUpdateBeats.mockResolvedValue({
                success: false,
                error: { message: "Update failed" },
            });

            // Call the private method directly
            // @ts-ignore - Accessing private method for testing
            await editableTimingMarkersPlugin.handleBeatResized(mockRegion);
        });
    });
});
