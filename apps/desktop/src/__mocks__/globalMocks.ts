import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import type MarcherPage from "@/global/classes/MarcherPage";
import { FieldProperties } from "@openmarch/core";
import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

export const mockMarchers: Marcher[] = [
    {
        id: 1,
        name: "Marc Sylvester",
        section: "Flute",
        drill_prefix: "F",
        drill_order: 1,
        drill_number: "F1",
        notes: "Inducted in 2001 - DCI Hall of Fame (probably didn't play flute",
        year: "Freshman",
        created_at: "some_time",
        updated_at: "other_time",
        home_x: 0,
        home_y: 0,
    },
    {
        id: 2,
        name: "George Zingali",
        section: "Snare",
        drill_prefix: "S",
        drill_order: 1,
        drill_number: "S1",
        notes: "Inducted in 1991 - DCI Hall of Fame",
        year: "Sophomore",
        created_at: "some_time",
        updated_at: "other_time",
        home_x: 0,
        home_y: 0,
    },
    {
        id: 3,
        name: "John Bilby",
        section: "Trumpet",
        drill_prefix: "T",
        drill_order: 1,
        drill_number: "T1",
        notes: null,
        year: null,
        created_at: "some_time",
        updated_at: "other_time",
        home_x: 0,
        home_y: 0,
    },
    {
        id: 4,
        name: "",
        section: "Baritone",
        drill_prefix: "B",
        drill_order: 2,
        drill_number: "B2",
        notes: null,
        year: null,
        created_at: "some_time",
        updated_at: "other_time",
        home_x: 0,
        home_y: 0,
    },
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

export const mockMarcherPages: MarcherPage[] = [
    {
        marcher_id: 1,
        page_id: 1,
        x: 50,
        y: 50,
        notes: "This is the first marcherPage",
    },
    {
        marcher_id: 2,
        page_id: 1,
        x: 0,
        y: 0,
        notes: "This is the second marcherPage",
    },
    {
        marcher_id: 3,
        page_id: 1,
        x: -200,
        y: -500,
        notes: null,
    },
    {
        marcher_id: 1,
        page_id: 2,
        x: 0,
        y: 0,
        notes: "This is the first marcherPage",
    },
    {
        marcher_id: 2,
        page_id: 2,
        x: 284,
        y: 963.1,
        notes: "This is the second marcherPage",
    },
    {
        marcher_id: 3,
        page_id: 2,
        x: -200,
        y: 105.015,
        notes: null,
    },
    {
        marcher_id: 1,
        page_id: 3,
        x: 50,
        y: 50,
        notes: "This is the first marcherPage",
    },
    {
        marcher_id: 2,
        page_id: 3,
        x: 0,
        y: 0,
        notes: "This is the second marcherPage",
    },
    {
        marcher_id: 3,
        page_id: 3,
        x: -200,
        y: -500,
        notes: null,
    },
] as const;

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
        stepSizeInches: 22.5,
    });
