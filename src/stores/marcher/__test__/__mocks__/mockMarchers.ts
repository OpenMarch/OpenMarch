import { Marcher } from "@/global/Interfaces";

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
    }
] as const;
