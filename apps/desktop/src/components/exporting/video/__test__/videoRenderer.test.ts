import { describe, expect, it } from "vitest";
import type { FieldProperties } from "@openmarch/core";
import { exportVideo } from "../videoRenderer";
import { ResolverFrameSampler } from "@/timeline/timelineExport";

const minimalExportArgs = {
    fieldProperties: { width: 1600, height: 900 } as FieldProperties,
    marchers: [],
    sortedPages: [],
    frameSampler: new ResolverFrameSampler(
        { marcherIds: () => [], positionsAt: () => {} },
        [],
    ),
    appearanceSteps: undefined,
    backgroundImage: null,
    audioData: new ArrayBuffer(0),
    audioOffsetSeconds: 0,
    width: 1920,
    height: 1080,
    fps: 30,
    videoTheme: "light" as const,
};

describe("exportVideo", () => {
    it("throws when sortedPages is empty", async () => {
        await expect(exportVideo(minimalExportArgs)).rejects.toThrow(
            "The show has no pages to export",
        );
    });
});
