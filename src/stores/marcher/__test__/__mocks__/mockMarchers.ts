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
        year: 2021
    }
] as const;
