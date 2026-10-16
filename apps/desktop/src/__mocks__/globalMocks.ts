import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import type MarcherPage from "@/global/classes/MarcherPage";
import { FieldProperties } from "@openmarch/core";
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
