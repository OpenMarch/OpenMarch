import { describe, expect, it } from "vitest";
import {
    computeFieldViewport,
    DEFAULT_FIELD_FRAMING,
    FIELD_MARGIN_PX,
} from "../videoFrameRenderer";
import type { FieldProperties } from "@openmarch/core";

const fieldProperties = {
    width: 1600,
    height: 900,
} as FieldProperties;

describe("computeFieldViewport", () => {
    it("centers the field with auto-fit scale at default framing", () => {
        const frameWidth = 1920;
        const frameHeight = 1080;
        const baseScale = Math.min(
            frameWidth / (fieldProperties.width + FIELD_MARGIN_PX * 2),
            frameHeight / (fieldProperties.height + FIELD_MARGIN_PX * 2),
        );

        const viewport = computeFieldViewport(
            fieldProperties,
            frameWidth,
            frameHeight,
        );

        expect(viewport).toEqual([
            baseScale,
            0,
            0,
            baseScale,
            (frameWidth - fieldProperties.width * baseScale) / 2,
            (frameHeight - fieldProperties.height * baseScale) / 2,
        ]);
    });

    it("applies a scale multiplier on top of auto-fit", () => {
        const frameWidth = 1280;
        const frameHeight = 720;
        const baseScale = Math.min(
            frameWidth / (fieldProperties.width + FIELD_MARGIN_PX * 2),
            frameHeight / (fieldProperties.height + FIELD_MARGIN_PX * 2),
        );
        const framing = { ...DEFAULT_FIELD_FRAMING, scale: 1.5 };

        const viewport = computeFieldViewport(
            fieldProperties,
            frameWidth,
            frameHeight,
            framing,
        );
        const scale = baseScale * 1.5;

        expect(viewport[0]).toBe(scale);
        expect(viewport[3]).toBe(scale);
        expect(viewport[4]).toBe(
            (frameWidth - fieldProperties.width * scale) / 2,
        );
        expect(viewport[5]).toBe(
            (frameHeight - fieldProperties.height * scale) / 2,
        );
    });

    it("applies normalized pan offsets", () => {
        const frameWidth = 1920;
        const frameHeight = 1080;
        const framing = {
            ...DEFAULT_FIELD_FRAMING,
            offsetX: 0.1,
            offsetY: -0.05,
        };

        const viewport = computeFieldViewport(
            fieldProperties,
            frameWidth,
            frameHeight,
            framing,
        );
        const defaultViewport = computeFieldViewport(
            fieldProperties,
            frameWidth,
            frameHeight,
        );

        expect(viewport[4]).toBe(defaultViewport[4]! + frameWidth * 0.1);
        expect(viewport[5]).toBe(defaultViewport[5]! + frameHeight * -0.05);
    });
});
