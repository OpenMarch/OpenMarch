import { Page } from "@/global/Interfaces";

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
    }
] as const;
