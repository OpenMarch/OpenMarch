import { describe, expect, it } from "vitest";
import { fabric } from "fabric";
import {
    computeFieldViewport,
    DEFAULT_FIELD_FRAMING,
    FIELD_MARGIN_PX,
    hideMarchers,
    rebuildPropsForTime,
    restoreMarcherVisibility,
    setMarcherPositionsAtTime,
    type VideoRenderContext,
} from "../videoFrameRenderer";
import type { FieldProperties } from "@openmarch/core";
import type Page from "@/global/classes/Page";
import type MarcherPage from "@/global/classes/MarcherPage";
import type {
    PropWithMarcher,
    DatabasePropPageGeometry,
} from "@/global/classes/Prop";
import type { MarcherTimeline } from "@/utilities/Keyframes";
import CanvasProp from "@/global/classes/canvasObjects/CanvasProp";

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

// --- Prop animation in video export -------------------------------------

const PROP_MARCHER_ID = 10;

const makeMarcher = () =>
    ({
        id: PROP_MARCHER_ID,
        name: "Prop A",
        drill_prefix: "P",
        drill_order: 1,
        section: "Prop",
        year: null,
        notes: null,
        type: "prop",
    }) as never;

const makeProp = (): PropWithMarcher =>
    ({
        id: 1,
        marcher_id: PROP_MARCHER_ID,
        marcher: makeMarcher(),
    }) as unknown as PropWithMarcher;

const makeMarcherPage = (id: number): MarcherPage =>
    ({ id, marcher_id: PROP_MARCHER_ID, x: 100, y: 100 }) as MarcherPage;

const makeGeometry = (
    marcher_page_id: number,
    width: number,
    height: number,
    visible = true,
): DatabasePropPageGeometry =>
    ({
        id: marcher_page_id * 100,
        marcher_page_id,
        shape_type: "rectangle",
        width,
        height,
        rotation: 0,
        visible,
        custom_geometry: null,
    }) as unknown as DatabasePropPageGeometry;

/** Two pages: page 1 (from, mp id 100) -> page 2 (to, mp id 200). */
const makePages = (): Page[] =>
    [
        { id: 1, timestamp: 0, duration: 1, nextPageId: 2 },
        { id: 2, timestamp: 1, duration: 1, nextPageId: null },
    ] as unknown as Page[];

/** Prop grows from 10ft (t=0) to 20ft (t=2000ms) in width. */
const makeTimeline = (): Map<number, MarcherTimeline> => {
    const pathMap = new Map([
        [
            0,
            {
                x: 100,
                y: 100,
                geometry: { width: 10, height: 10, rotation: 0 },
            },
        ],
        [
            2000,
            {
                x: 100,
                y: 100,
                geometry: { width: 20, height: 10, rotation: 0 },
            },
        ],
    ]);
    return new Map([
        [
            PROP_MARCHER_ID,
            { pathMap, sortedTimestamps: [0, 2000] } as MarcherTimeline,
        ],
    ]);
};

const makeContext = (
    geometryVisible = true,
): VideoRenderContext & { canvas: fabric.StaticCanvas } => {
    const canvas = new fabric.StaticCanvas(null);
    return {
        canvas,
        canvasMarchersById: {},
        fieldProperties: { width: 1600, height: 900 } as FieldProperties,
        sortedPages: makePages(),
        marcherTimelines: makeTimeline(),
        lastAppliedPageId: null,
        props: [makeProp()],
        // Base geometry for page 1 is 10ft wide; page 2 is 20ft wide.
        propGeometries: [
            makeGeometry(100, 10, 10, geometryVisible),
            makeGeometry(200, 20, 10, geometryVisible),
        ],
        marcherPagesByPage: {
            1: { [PROP_MARCHER_ID]: makeMarcherPage(100) },
            2: { [PROP_MARCHER_ID]: makeMarcherPage(200) },
        },
        canvasPropsById: {},
        lastPropsPageId: null,
        pixelsPerFoot: 12,
        staticFieldCache: null,
        dispose: () => canvas.dispose(),
    } as unknown as VideoRenderContext & { canvas: fabric.StaticCanvas };
};

describe("prop animation in video export", () => {
    it("builds a CanvasProp from the active page and live-scales it across a move", () => {
        const context = makeContext();

        // At the "from" page the prop is built from page 1's geometry (10ft).
        rebuildPropsForTime(context, 0);
        const canvasProp = context.canvasPropsById[PROP_MARCHER_ID];
        expect(canvasProp).toBeInstanceOf(CanvasProp);
        expect(context.canvas.getObjects()).toContain(canvasProp);
        expect(context.lastPropsPageId).toBe(1);

        setMarcherPositionsAtTime(context, 0);
        const scaleAtStart = canvasProp.scaleX ?? 1;

        // Partway into the move to page 2 the interpolated width is larger,
        // so the same CanvasProp (base 10ft) must be scaled up.
        rebuildPropsForTime(context, 1500);
        // Still the same "from" page -> no rebuild, same instance.
        expect(context.canvasPropsById[PROP_MARCHER_ID]).toBe(canvasProp);
        setMarcherPositionsAtTime(context, 1500);
        const scaleMidMove = canvasProp.scaleX ?? 1;

        expect(scaleAtStart).toBeCloseTo(1, 5);
        expect(scaleMidMove).toBeGreaterThan(scaleAtStart);
    });

    it("skips props whose geometry is not visible", () => {
        const context = makeContext(false);
        rebuildPropsForTime(context, 0);
        expect(context.canvasPropsById[PROP_MARCHER_ID]).toBeUndefined();
        expect(context.canvas.getObjects()).toHaveLength(0);
    });

    it("hides props for the static field cache and restores them (section E)", () => {
        const context = makeContext();
        rebuildPropsForTime(context, 0);
        const canvasProp = context.canvasPropsById[PROP_MARCHER_ID];
        expect(canvasProp.visible).not.toBe(false);

        const visibility = hideMarchers(context);
        // The prop must be hidden so it is not baked into the static cache.
        expect(canvasProp.visible).toBe(false);
        // hideMarchers must include the prop in its tracked visibility list.
        expect(visibility.some((v) => v.canvasMarcher === canvasProp)).toBe(
            true,
        );

        restoreMarcherVisibility(visibility);
        expect(canvasProp.visible).toBe(true);
    });
});
