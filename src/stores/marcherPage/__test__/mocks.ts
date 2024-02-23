import { MarcherPage } from "@/global/Interfaces";

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
