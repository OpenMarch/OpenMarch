import { Marcher, Page } from "@/global/Interfaces";

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
        time_signature: '4/4',
        notes: 'This is the first page'
    },
    {
        id: 2,
        id_for_html: 'page_2',
        name: '2',
        counts: 8,
        order: 2,
        tempo: 89,
        time_signature: '12/8',
        notes: 'This is the second page'
    },
    {
        id: 3,
        id_for_html: 'page_3',
        name: '3',
        counts: 16,
        order: 3,
        tempo: undefined,
        time_signature: undefined,
        notes: undefined
    },
    {
        id: 4,
        id_for_html: 'page_4',
        name: '4',
        counts: 32,
        order: 3,
        tempo: undefined,
        time_signature: undefined,
        notes: undefined
    }
] as const;
