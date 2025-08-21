import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import MarcherPage, {
    DatabaseMarcherPage,
    databaseMarcherPagesToMarcherPages,
} from "@/global/classes/MarcherPage";
import { FieldProperties } from "@openmarch/core";
import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import type { Shape } from "electron/database/tables/ShapeTable";
import type { ShapePage } from "electron/database/tables/ShapePageTable";
import { marcherPageMapFromArray } from "@/global/classes/MarcherPageIndex";
import {
    CubicCurve,
    Line,
    Path,
    QuadraticCurve,
    Spline,
} from "@openmarch/path-utility";

export const mockMarchers: Marcher[] = [
    new Marcher({
        id: 1,
        name: "Marc Sylvester",
        section: "Flute",
        drill_prefix: "F",
        drill_order: 1,
        notes: "Inducted in 2001 - DCI Hall of Fame (probably didn't play flute",
        year: "Freshman",
    }),
    new Marcher({
        id: 2,
        name: "George Zingali",
        section: "Snare",
        drill_prefix: "S",
        drill_order: 1,
        notes: "Inducted in 1991 - DCI Hall of Fame",
        year: "Sophomore",
    }),
    new Marcher({
        id: 3,
        name: "John Bilby",
        section: "Trumpet",
        drill_prefix: "T",
        drill_order: 1,
        notes: undefined,
        year: undefined,
    }),
    new Marcher({
        id: 4,
        name: "",
        section: "Baritone",
        drill_prefix: "B",
        drill_order: 2,
        notes: undefined,
        year: undefined,
    }),
] as const;

export const mockPages: Page[] = [
    {
        id: 1,
        name: "1",
        counts: 16,
        order: 1,
        notes: "This is the first page",
        nextPageId: 2,
        previousPageId: null,
        isSubset: false,
        duration: 8,
        beats: [],
        measures: [],
        measureBeatToStartOn: 1,
        measureBeatToEndOn: 0,
        timestamp: 0,
    } satisfies Page,
    {
        id: 2,
        name: "2",
        counts: 8,
        order: 2,
        notes: "This is the second page",
        nextPageId: 3,
        previousPageId: 1,
        isSubset: false,
        duration: 4,
        beats: [],
        measures: [],
        measureBeatToStartOn: 1,
        measureBeatToEndOn: 0,
        timestamp: 8,
    } satisfies Page,
    {
        id: 3,
        name: "3",
        counts: 16,
        order: 3,
        notes: null,
        nextPageId: null,
        previousPageId: 2,
        isSubset: false,
        duration: 8,
        beats: [],
        measures: [],
        measureBeatToStartOn: 1,
        measureBeatToEndOn: 0,
        timestamp: 12,
    } satisfies Page,
] as const;

export const mockMarcherPages: DatabaseMarcherPage[] = [
    {
        id: 1,
        id_for_html: "marcherPage_1",
        marcher_id: 1,
        page_id: 1,
        x: 50,
        y: 50,
        notes: "This is the first marcherPage",
        path_data: new Path([
            new Line({ x: 0, y: 0 }, { x: 100, y: 100 }),
        ]).toJson(),
        pathway_notes: null,
        created_at: "some_time",
        updated_at: "other_time",
        path_data_id: null,
        path_start_position: null,
        path_end_position: null,
    },
    {
        id: 2,
        id_for_html: "marcherPage_2",
        marcher_id: 2,
        page_id: 1,
        x: 0,
        y: 0,
        notes: "This is the second marcherPage",
        path_data: new Path([
            new QuadraticCurve(
                { x: 0, y: 0 },
                { x: 100, y: 100 },
                { x: 200, y: 200 },
            ),
        ]).toJson(),
        pathway_notes: null,
        created_at: "some_time",
        updated_at: "other_time",
        path_data_id: null,
        path_start_position: null,
        path_end_position: null,
    },
    {
        id: 3,
        id_for_html: "marcherPage_3",
        marcher_id: 3,
        page_id: 1,
        x: -200,
        y: -500,
        notes: null,
        path_data: new Path([
            new CubicCurve(
                { x: 0, y: 0 },
                { x: 100, y: 100 },
                { x: 200, y: 200 },
                { x: 300, y: 300 },
            ),
        ]).toJson(),
        pathway_notes: null,
        created_at: "some_time",
        updated_at: "other_time",
        path_data_id: null,
        path_start_position: null,
        path_end_position: null,
    },
    {
        id: 4,
        id_for_html: "marcherPage_4",
        marcher_id: 1,
        page_id: 2,
        x: 0,
        y: 0,
        notes: "This is the first marcherPage",
        path_data: new Path([
            new Spline([
                { x: 0, y: 0 },
                { x: 100, y: 100 },
                { x: 200, y: 200 },
            ]),
        ]).toJson(),
        pathway_notes: null,
        created_at: "some_time",
        updated_at: "other_time",
        path_data_id: null,
        path_start_position: null,
        path_end_position: null,
    },
    {
        id: 5,
        id_for_html: "marcherPage_5",
        marcher_id: 2,
        page_id: 2,
        x: 284,
        y: 963.1,
        notes: "This is the second marcherPage",
        path_data: null,
        pathway_notes: null,
        created_at: "some_time",
        updated_at: "other_time",
        path_data_id: null,
        path_start_position: null,
        path_end_position: null,
    },
    {
        id: 6,
        id_for_html: "marcherPage_6",
        marcher_id: 3,
        page_id: 2,
        x: -200,
        y: 105.015,
        notes: null,
        path_data: null,
        pathway_notes: null,
        created_at: "some_time",
        updated_at: "other_time",
        path_data_id: null,
        path_start_position: null,
        path_end_position: null,
    },
    {
        id: 1,
        id_for_html: "marcherPage_7",
        marcher_id: 1,
        page_id: 3,
        x: 50,
        y: 50,
        notes: "This is the first marcherPage",
        path_data: null,
        pathway_notes: null,
        created_at: "some_time",
        updated_at: "other_time",
        path_data_id: null,
        path_start_position: null,
        path_end_position: null,
    },
    {
        id: 2,
        id_for_html: "marcherPage_8",
        marcher_id: 2,
        page_id: 3,
        x: 0,
        y: 0,
        notes: "This is the second marcherPage",
        path_data: null,
        pathway_notes: null,
        created_at: "some_time",
        updated_at: "other_time",
        path_data_id: null,
        path_start_position: null,
        path_end_position: null,
    },
    {
        id: 3,
        id_for_html: "marcherPage_9",
        marcher_id: 3,
        page_id: 3,
        x: -200,
        y: -500,
        notes: null,
        path_data: null,
        pathway_notes: null,
        created_at: "some_time",
        updated_at: "other_time",
        path_data_id: null,
        path_start_position: null,
        path_end_position: null,
    },
] as const;

export const mockMarcherPageMap = marcherPageMapFromArray(
    databaseMarcherPagesToMarcherPages(mockMarcherPages),
);

export const mockMarcherLines: MarcherLine[] = [
    new MarcherLine({
        id: 1,
        startPageId: 1,
        endPageId: 2,
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
        notes: "This is the first marcherLine",
    }),
    new MarcherLine({
        id: 2,
        startPageId: 2,
        endPageId: 2,
        x1: 200,
        y1: 0,
        x2: 0,
        y2: 0,
    }),
    new MarcherLine({
        id: 1,
        startPageId: 2,
        endPageId: 4,
        x1: 5,
        y1: 10,
        x2: -50,
        y2: 1000,
        notes: "This is the last marcherLine",
    }),
] as const;

export const mockShapes: Shape[] = [
    {
        id: 1,
        name: "Shape 1",
        updated_at: "some_time",
        created_at: "other_time",
        notes: "These are notes",
    },
    {
        id: 2,
        name: "Shape 2",
        updated_at: "some_time",
        created_at: "other_time",
        notes: null,
    },
    {
        id: 3,
        name: "Shape 3",
        updated_at: "some_time",
        created_at: "other_time",
        notes: "",
    },
] as const;

export const mockShapePages: ShapePage[] = [
    {
        id: 1,
        shape_id: 1,
        page_id: 1,
        svg_path: "M 0 0 L 100 100",
        created_at: "some_time",
        updated_at: "other_time",
        notes: "These are notes",
    },
    {
        id: 2,
        shape_id: 2,
        page_id: 1,
        svg_path: "M 200 0 L 0 0",
        created_at: "some_time",
        updated_at: "other_time",
        notes: null,
    },
    {
        id: 3,
        shape_id: 3,
        page_id: 1,
        svg_path: "M 5 10 L -50 1000",
        created_at: "some_time",
        updated_at: "other_time",
        notes: "",
    },
] as const;

/**
 * A list of properties for a college football field. Each property is in steps. For pixels, multiply by pixelsPerStep.
 */
export const mockNCAAFieldProperties: FieldProperties =
    FieldPropertiesTemplates.COLLEGE_FOOTBALL_FIELD_NO_END_ZONES;
/**
 * A mock to represent the field back when an 8-to-5 step was 24 pixels.
 * This is here because many of the unit tests had that number hard-coded
 */
export const legacyMockNCAAFieldProperties: FieldProperties =
    new FieldProperties({
        ...mockNCAAFieldProperties,
        stepSizeInches:
            mockNCAAFieldProperties.stepSizeInches *
            (24 / mockNCAAFieldProperties.stepSizeInches),
    });
