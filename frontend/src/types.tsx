export const typeIndentifiers = {
    Page: "Page",
    Marcher: "Marcher"
} as const;
type TypeIdentifiers = typeof typeIndentifiers;

export type Page = {
    id: string;
    name: string;
    counts: number;
    order: number;
    type: TypeIdentifiers["Page"];
};

export type Marcher = {
    id: string;
    name: string;
    instrument: string;
    drillNumber: number;
    drillPrefix: string;
    type: TypeIdentifiers["Marcher"];
};

export type MarcherPage = {
    id: string;
    marcherId: number;
    pageId: number;
    x: number;
    y: number;
}
