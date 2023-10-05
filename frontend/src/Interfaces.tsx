// A collection of interfaces and types used throughout the application
import { Constants } from "./Constants";
import { updateMarcherPage } from "./api/api";
type InterfaceConstType = typeof Constants;

export interface Page {
    id: number;
    id_for_html: string;
    name: string;
    counts: number;
    order: number;
    tableName: InterfaceConstType["PageTableName"];
    prefix: InterfaceConstType["PagePrefix"];
};

export interface NewPage {
    name: string;
    counts: number;
};

export interface Marcher {
    id: number;
    id_for_html: string;
    name: string;
    instrument: string;
    drill_number: string;
    drill_prefix: string;
    drill_order: number;
    tableName: InterfaceConstType["MarcherTableName"];
    prefix: InterfaceConstType["MarcherPrefix"];
};

export interface MarcherPage {
    id: number;
    id_for_html: string;
    marcher_id: number;
    page_id: number;
    x: number;
    y: number;
    tableName: InterfaceConstType["MarcherPageTableName"];
    prefix: InterfaceConstType["MarcherPagePrefix"];
}

export interface UpdateMarcherPage {
    x: number;
    y: number;
}