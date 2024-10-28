import Marcher from "@/global/classes/Marcher";
import Page from "@/global/classes/Page";
import MarcherPage from "@/global/classes/MarcherPage";
import FieldProperties from "@/global/classes/FieldProperties";
import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";

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
    new Page({
        id: 1,
        name: "1",
        counts: 16,
        order: 1,
        notes: "This is the first page",
        nextPageId: 2,
        previousPageId: null,
    }),
    new Page({
        id: 2,
        name: "2",
        counts: 8,
        order: 2,
        notes: "This is the second page",
        nextPageId: 3,
        previousPageId: 1,
    }),
    new Page({
        id: 3,
        name: "3",
        counts: 16,
        order: 3,
        notes: undefined,
        nextPageId: null,
        previousPageId: 2,
    }),
] as const;

export const mockMarcherPages: MarcherPage[] = [
    {
        id: 1,
        id_for_html: "marcherPage_1",
        marcher_id: 1,
        page_id: 1,
        x: 50,
        y: 50,
        notes: "This is the first marcherPage",
    },
    {
        id: 2,
        id_for_html: "marcherPage_2",
        marcher_id: 2,
        page_id: 1,
        x: 0,
        y: 0,
        notes: "This is the second marcherPage",
    },
    {
        id: 3,
        id_for_html: "marcherPage_3",
        marcher_id: 3,
        page_id: 1,
        x: -200,
        y: -500,
        notes: undefined,
    },
    {
        id: 4,
        id_for_html: "marcherPage_4",
        marcher_id: 1,
        page_id: 2,
        x: 0,
        y: 0,
        notes: "This is the first marcherPage",
    },
    {
        id: 5,
        id_for_html: "marcherPage_5",
        marcher_id: 2,
        page_id: 2,
        x: 284,
        y: 963.1,
        notes: "This is the second marcherPage",
    },
    {
        id: 6,
        id_for_html: "marcherPage_6",
        marcher_id: 3,
        page_id: 2,
        x: -200,
        y: 105.015,
        notes: undefined,
    },
    {
        id: 1,
        id_for_html: "marcherPage_7",
        marcher_id: 1,
        page_id: 3,
        x: 50,
        y: 50,
        notes: "This is the first marcherPage",
    },
    {
        id: 2,
        id_for_html: "marcherPage_8",
        marcher_id: 2,
        page_id: 3,
        x: 0,
        y: 0,
        notes: "This is the second marcherPage",
    },
    {
        id: 3,
        id_for_html: "marcherPage_9",
        marcher_id: 3,
        page_id: 3,
        x: -200,
        y: -500,
        notes: undefined,
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
