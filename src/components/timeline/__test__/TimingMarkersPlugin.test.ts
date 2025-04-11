import { describe, expect, it, vi, beforeEach } from "vitest";
import { TimingMarkersPlugin } from "../TimingMarkersPlugin";
import type Beat from "@/global/classes/Beat";
import type Measure from "@/global/classes/Measure";

describe("TimingMarkersPlugin", () => {
    // Mock data
    const mockBeats: Beat[] = [
        {
            id: 1,
            position: 0,
            duration: 1,
            includeInMeasure: true,
            notes: null,
            i: 0,
        },
        {
            id: 2,
            position: 1,
            duration: 1.5,
            includeInMeasure: true,
            notes: null,
            i: 1,
        },
        {
            id: 3,
            position: 2,
            duration: 2,
            includeInMeasure: true,
            notes: null,
            i: 2,
        },
    ];

    const mockMeasures: Measure[] = [
        {
            id: 1,
            startBeat: mockBeats[0],
            number: 1,
            rehearsalMark: null,
            notes: null,
            duration: 2.5,
            counts: 4,
            beats: [mockBeats[0], mockBeats[1]],
        },
        {
            id: 2,
            startBeat: mockBeats[2],
            number: 2,
            rehearsalMark: "A",
            notes: "Test measure",
            duration: 2,
            counts: 4,
            beats: [mockBeats[2]],
        },
    ];

    // Mock WaveSurfer regions plugin
    const mockRegion = {
        remove: vi.fn(),
    };

    const mockWsRegions = {
        addRegion: vi.fn().mockReturnValue(mockRegion),
    };

    let timingMarkersPlugin: TimingMarkersPlugin;

    beforeEach(() => {
        // Reset mocks before each test
        vi.clearAllMocks();

        // Create a new instance of the plugin for each test
        timingMarkersPlugin = new TimingMarkersPlugin(
            mockWsRegions,
            mockBeats,
            mockMeasures,
        );
    });

    describe("constructor", () => {
        it("should initialize with the provided parameters", () => {
            // Create a new instance to test constructor
            const plugin = new TimingMarkersPlugin(
                mockWsRegions,
                mockBeats,
                mockMeasures,
            );

            // Use private property access for testing
            // @ts-ignore - Accessing private properties for testing
            expect(plugin.wsRegions).toBe(mockWsRegions);
            // @ts-ignore - Accessing private properties for testing
            expect(plugin.beats).toEqual(mockBeats);
            // @ts-ignore - Accessing private properties for testing
            expect(plugin.measures).toEqual(mockMeasures);
            // @ts-ignore - Accessing private properties for testing
            expect(plugin.measureRegions).toBeInstanceOf(Map);
            // @ts-ignore - Accessing private properties for testing
            expect(plugin.beatRegions).toBeInstanceOf(Map);
        });
    });

    describe("createTimingMarkers", () => {
        it("should create beat regions for each beat", () => {
            timingMarkersPlugin.createTimingMarkers();

            // Should call addRegion for each beat
            expect(mockWsRegions.addRegion).toHaveBeenCalledTimes(
                mockBeats.length + mockMeasures.length,
            );

            // Check beat regions
            let curTimestamp = 0;
            mockBeats.forEach((beat) => {
                expect(mockWsRegions.addRegion).toHaveBeenCalledWith({
                    id: `beat beat-${beat.id}`,
                    start: curTimestamp,
                    drag: false,
                    resize: false,
                });
                curTimestamp += beat.duration;
            });
        });

        it("should create measure regions for each measure", () => {
            timingMarkersPlugin.createTimingMarkers();

            // Check measure regions
            let curTimestamp = 0;
            mockMeasures.forEach((measure) => {
                expect(mockWsRegions.addRegion).toHaveBeenCalledWith({
                    id: `${measure.rehearsalMark ? "rehearsalMark" : "measure"} measure-${measure.id}`,
                    start: curTimestamp,
                    content: measure.rehearsalMark ?? measure.number.toString(),
                    drag: false,
                    resize: false,
                });
                curTimestamp += measure.duration;
            });
        });

        it("should store created regions in the appropriate maps", () => {
            timingMarkersPlugin.createTimingMarkers();

            // Check that regions are stored in maps
            // @ts-ignore - Accessing private properties for testing
            expect(timingMarkersPlugin.beatRegions.size).toBe(mockBeats.length);
            // @ts-ignore - Accessing private properties for testing
            expect(timingMarkersPlugin.measureRegions.size).toBe(
                mockMeasures.length,
            );

            // Check specific entries
            mockBeats.forEach((beat) => {
                // @ts-ignore - Accessing private properties for testing
                expect(timingMarkersPlugin.beatRegions.get(beat.id)).toBe(
                    mockRegion,
                );
            });

            mockMeasures.forEach((measure) => {
                // @ts-ignore - Accessing private properties for testing
                expect(timingMarkersPlugin.measureRegions.get(measure.id)).toBe(
                    mockRegion,
                );
            });
        });
    });

    describe("clearTimingMarkers", () => {
        it("should remove all beat and measure regions", () => {
            // First create the markers
            timingMarkersPlugin.createTimingMarkers();

            // Then clear them
            timingMarkersPlugin.clearTimingMarkers();

            // Should call remove for each region
            expect(mockRegion.remove).toHaveBeenCalledTimes(
                mockBeats.length + mockMeasures.length,
            );
        });

        it("should handle empty maps gracefully", () => {
            // Create a new plugin with empty maps
            const emptyPlugin = new TimingMarkersPlugin(mockWsRegions, [], []);

            // Should not throw an error
            expect(() => emptyPlugin.clearTimingMarkers()).not.toThrow();

            // Should not call remove
            expect(mockRegion.remove).not.toHaveBeenCalled();
        });

        it("should handle null regions gracefully", () => {
            // Create a plugin with valid data
            const plugin = new TimingMarkersPlugin(
                mockWsRegions,
                mockBeats,
                mockMeasures,
            );

            // Manually set a null region in the maps
            // @ts-ignore - Accessing private properties for testing
            plugin.beatRegions.set(1, null);
            // @ts-ignore - Accessing private properties for testing
            plugin.measureRegions.set(1, null);

            // Should not throw an error when encountering null regions
            expect(() => plugin.clearTimingMarkers()).not.toThrow();
        });

        it("should clear maps after removing regions", () => {
            // Create a plugin with valid data
            const plugin = new TimingMarkersPlugin(
                mockWsRegions,
                mockBeats,
                mockMeasures,
            );

            // Create some markers
            plugin.createTimingMarkers();

            // Clear the markers
            plugin.clearTimingMarkers();

            // @ts-ignore - Accessing private properties for testing
            expect(plugin.beatRegions.size).toBe(0);
            // @ts-ignore - Accessing private properties for testing
            expect(plugin.measureRegions.size).toBe(0);
        });

        it("should handle region removal errors gracefully", () => {
            const consoleSpy = vi.spyOn(console, "warn");

            // Create a plugin with a region that throws on remove
            const mockRegionWithError = {
                remove: () => {
                    throw new Error("Failed to remove region");
                },
            };

            const plugin = new TimingMarkersPlugin(
                mockWsRegions,
                mockBeats,
                mockMeasures,
            );
            // @ts-ignore - Accessing private properties for testing
            plugin.beatRegions.set(1, mockRegionWithError);

            // Should not throw when region removal fails
            expect(() => plugin.clearTimingMarkers()).not.toThrow();

            // Should log warning
            expect(consoleSpy).toHaveBeenCalledWith(
                "Failed to remove beat region:",
                expect.any(Error),
            );

            // Maps should still be cleared
            // @ts-ignore - Accessing private properties for testing
            expect(plugin.beatRegions.size).toBe(0);
            // @ts-ignore - Accessing private properties for testing
            expect(plugin.measureRegions.size).toBe(0);
        });
    });

    describe("updateTimingMarkers", () => {
        it("should update beats and measures and recreate markers", () => {
            // Create spy on console.log
            const consoleSpy = vi.spyOn(console, "log");

            // First create the initial markers
            timingMarkersPlugin.createTimingMarkers();

            // Reset mocks to track new calls
            vi.clearAllMocks();

            // Create new mock data
            const newBeats: Beat[] = [
                {
                    id: 4,
                    position: 0,
                    duration: 1,
                    includeInMeasure: true,
                    notes: null,
                    i: 0,
                },
            ];

            const newMeasures: Measure[] = [
                {
                    id: 3,
                    startBeat: newBeats[0],
                    number: 3,
                    rehearsalMark: "B",
                    notes: null,
                    duration: 1,
                    counts: 2,
                    beats: [newBeats[0]],
                },
            ];

            // Update the markers
            timingMarkersPlugin.updateTimingMarkers(newBeats, newMeasures);

            // Should log the update
            expect(consoleSpy).toHaveBeenCalledWith(
                "Updating timing markers",
                newBeats,
                newMeasures,
            );

            // Should update the internal beats and measures
            // @ts-ignore - Accessing private properties for testing
            expect(timingMarkersPlugin.beats).toBe(newBeats);
            // @ts-ignore - Accessing private properties for testing
            expect(timingMarkersPlugin.measures).toBe(newMeasures);

            // Should call remove for each original region
            expect(mockRegion.remove).toHaveBeenCalledTimes(
                mockBeats.length + mockMeasures.length,
            );

            // Should call addRegion for each new beat and measure
            expect(mockWsRegions.addRegion).toHaveBeenCalledTimes(
                newBeats.length + newMeasures.length,
            );
        });
    });
});
