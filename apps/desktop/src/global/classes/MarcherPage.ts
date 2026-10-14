/**
 * A marcher's position on a page: where the canvas draws it at the page's end beat, and what the
 * coordinate tools (`CoordinateActions`) read and write. Positions come from the timeline resolver;
 * nothing is stored per marcher per page any more. `page_id` only says which page the position was
 * read on, and timeline writes ignore it.
 */
export default interface MarcherPage {
    readonly marcher_id: number;
    readonly page_id: number;
    readonly x: number;
    readonly y: number;
    readonly notes?: string | null;
}

/**
 * New coordinates for a marcher from a coordinate tool. Any `page_id` is ignored: timeline writes
 * edit where the selection edits (`planCanvasEdit`).
 */
export interface ModifiedMarcherPageArgs {
    marcher_id: number;
    page_id: number;
    /** The new X coordinate */
    x: number;
    /** The new Y coordinate */
    y: number;
    notes?: string | null;
}

/** A map of marcher IDs to their positions on one page */
export type MarcherPagesByMarcher = Record<number, MarcherPage>;
