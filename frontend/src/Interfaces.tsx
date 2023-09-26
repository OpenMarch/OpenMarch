// A collection of interfaces and types used throughout the application
export const InterfaceConst = {
    PageTableName: "pages",
    MarcherTableName: "marchers",
    MarcherPageTableName: "marcher_pages"
} as const;
type InterfaceConstType = typeof InterfaceConst;

export interface Page {
    id: number;
    id_for_html: string;
    name: string;
    counts: number;
    order: number;
    tableName: InterfaceConstType["PageTableName"];
};

export interface Marcher {
    id: number;
    id_for_html: string;
    name: string;
    instrument: string;
    drill_number: number;
    drill_prefix: string;
    tableName: InterfaceConstType["MarcherTableName"];
};

export interface MarcherPage {
    id: number;
    id_for_html: string;
    marcher_id: number;
    page_id: number;
    x: number;
    y: number;
    tableName: InterfaceConstType["MarcherPageTableName"];
}
