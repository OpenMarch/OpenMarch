import { FieldProperties, MarcherPage } from "@/global/Interfaces";
import { Marcher } from "@/global/classes/Marcher";
import { Page } from "@/global/classes/Page";
import { TimeSignature } from "@/global/classes/TimeSignature";

export const mockMarchers: Marcher[] = [
    {
        id: 1,
        id_for_html: 'marcher_1',
        name: 'Marc Sylvester',
        section: 'Flute',
        drill_number: 'F1',
        drill_prefix: 'F',
        drill_order: 1,
        notes: 'Inducted in 2001 - DCI Hall of Fame (probably didn\'t play flute',
        year: 'Freshman'
    },
    {
        id: 2,
        id_for_html: 'marcher_2',
        name: 'George Zingali',
        section: 'Snare',
        drill_number: 'S1',
        drill_prefix: 'S',
        drill_order: 1,
        notes: 'Inducted in 1991 - DCI Hall of Fame',
        year: 'Sophomore'
    },
    {
        id: 3,
        id_for_html: 'marcher_3',
        name: 'John Bilby',
        section: 'Trumpet',
        drill_number: 'T1',
        drill_prefix: 'T',
        drill_order: 1,
        notes: undefined,
        year: undefined
    },
    {
        id: 4,
        id_for_html: 'marcher_4',
        name: '',
        section: 'Baritone',
        drill_number: 'B2',
        drill_prefix: 'B',
        drill_order: 2,
        notes: undefined,
        year: undefined
    }
] as const;

export const mockPages: Page[] = [
    {
        id: 1,
        id_for_html: 'page_1',
        name: '1',
        counts: 16,
        order: 1,
        tempo: 120,
        time_signature: TimeSignature.timeSignatureFromString('4/4'),
        notes: 'This is the first page'
    },
    {
        id: 2,
        id_for_html: 'page_2',
        name: '2',
        counts: 8,
        order: 2,
        tempo: 89,
        time_signature: TimeSignature.timeSignatureFromString('12/8'),
        notes: 'This is the second page'
    },
    {
        id: 3,
        id_for_html: 'page_3',
        name: '3',
        counts: 16,
        order: 3,
        tempo: 2,
        time_signature: TimeSignature.timeSignatureFromString('15/1'),
        notes: undefined
    }
] as const;

export const mockMarcherPages: MarcherPage[] = [
    {
        id: 1,
        id_for_html: 'marcherPage_1',
        marcher_id: 1,
        page_id: 1,
        x: 50,
        y: 50,
        notes: 'This is the first marcherPage'
    },
    {
        id: 2,
        id_for_html: 'marcherPage_2',
        marcher_id: 2,
        page_id: 2,
        x: 0,
        y: 0,
        notes: 'This is the second marcherPage'
    },
    {
        id: 3,
        id_for_html: 'marcherPage_3',
        marcher_id: 3,
        page_id: 3,
        x: -200,
        y: -500,
        notes: undefined
    }
] as const;

// The "origin" of a football field is on the 50 yard line on the front hash. This is the pixel position on the canvas.
const V1_ORIGIN = { x: 800, y: 520 };
/**
 * A list of properties for a college football field. Each property is in steps. For pixels, multiply by pixelsPerStep.
 */
export const mockV1FieldProperties: FieldProperties = {
    frontSideline: 32,
    frontHash: 0,
    backHash: -20,
    backSideline: -52,
    originX: V1_ORIGIN.x,
    originY: V1_ORIGIN.y,
    pixelsPerStep: 10,
    roundFactor: 20, // 1/x. 4 -> nearest .25, 2 -> nearest .5, 10 -> nearest .1, 100 -> nearest .01
    width: 1600,
    height: 840,
    stepsBetweenLines: 8
} as const;
