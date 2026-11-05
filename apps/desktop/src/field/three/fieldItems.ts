import {
    itemGeometryAt,
    type ItemGeometry,
    type RgbaColor,
} from "@openmarch/core";
import {
    insideOutline,
    outlineShape,
    PIXELS_PER_METER,
    placeOutline,
    type Pt,
} from "@/items/itemOutlines";
import type {
    DrawnItemGeometry,
    ItemOutlineChanges,
} from "@/items/itemOutlineTimeline";
import type { ItemFrame } from "@/field/editor/itemTransform";
import type { FieldItemSource, FieldMarchers } from "./fieldMarchers";

/** An item's Outline where the field draws it. */
export type DrawnItemOutline = {
    /** The item's marcher id */
    readonly id: number;
    /** Field units, turned and placed */
    readonly points: readonly Pt[];
    readonly closed: boolean;
    /** Its geometry at the beat drawn, with any size or turn being dragged */
    readonly geometry: ItemGeometry;
    /** Where the timeline (or a drag) has it */
    readonly center: Pt;
    /** The prop's own color (`items.color`), or null for the theme's line color */
    readonly color: RgbaColor | null;
};

/**
 * The show's items on the field (C2.1, ADR 0010 D-10): each one's Outline at
 * the beat the marchers are drawn at, around where the timeline (or a drag)
 * has it, outside React like {@link FieldMarchers}. The items layer draws
 * {@link outlines}, and the editor hits items anywhere inside their Outline
 * ({@link itemAt}).
 *
 * It tells the marchers which rows are items, and hides an item that is Off
 * field (before the count it was made on) or hidden by the user
 * (`UiSettingsStore.hiddenPropIds`): neither drawn nor hit.
 */
export class FieldItems implements FieldItemSource {
    ids: ReadonlySet<number> = new Set();
    /** Goes up whenever the items, their Outlines or a preview change. */
    version = 0;
    private changes: ItemOutlineChanges = new Map();
    private hidden: ReadonlySet<number> = new Set();
    private colors: ReadonlyMap<number, RgbaColor> = new Map();
    private previews = new Map<number, DrawnItemGeometry>();
    private drawn: {
        version: number;
        itemsVersion: number;
        appearanceVersion: number;
        outlines: readonly DrawnItemOutline[];
    } | null = null;
    /** Each item's geometry at one beat: the marks and the outlines ask at the same beat. */
    private geometries: {
        beat: number;
        byId: Map<number, ItemGeometry | null>;
    } | null = null;
    private readonly listeners = new Set<() => void>();

    constructor(private readonly marchers: FieldMarchers) {}

    /**
     * The items by marcher id, their Outline changes, those the user hid, and
     * the colors of those that have one.
     */
    set({
        itemIds,
        changes,
        hidden,
        colors = new Map(),
    }: {
        itemIds: ReadonlySet<number>;
        changes: ItemOutlineChanges;
        hidden: ReadonlySet<number>;
        colors?: ReadonlyMap<number, RgbaColor>;
    }) {
        this.ids = itemIds;
        this.changes = changes;
        this.hidden = hidden;
        this.colors = colors;
        this.geometries = null;
        // The marchers' marks first, so a listener reads the items as they now are
        this.version++;
        this.marchers.setItems(this);
        this.emit();
    }

    isItem(id: number): boolean {
        return this.ids.has(id);
    }

    /** Whether item `id` is drawn at `beat`: on field there and not hidden. */
    drawnAt(id: number, beat: number): boolean {
        return !this.hidden.has(id) && this.geometryAt(id, beat) !== null;
    }

    /**
     * Draws item `id` at this size and turn instead of its stored one, while
     * a handle drags it; null draws the stored one again.
     */
    setPreview(id: number, geometry: DrawnItemGeometry | null) {
        if (geometry) this.previews.set(id, geometry);
        else if (!this.previews.delete(id)) return;
        this.changed();
    }

    /** Every item drawn now, in the marchers' order. */
    outlines(): readonly DrawnItemOutline[] {
        const { marchers } = this;
        const cached = this.drawn;
        if (
            cached &&
            cached.version === marchers.version &&
            cached.itemsVersion === this.version &&
            cached.appearanceVersion === marchers.appearanceVersion
        )
            return cached.outlines;
        const beat = marchers.drawnBeat;
        const outlines: DrawnItemOutline[] = [];
        if (beat !== null) {
            const { ids, positions, isItem, hidden } = marchers;
            for (let i = 0; i < ids.length; i++) {
                if (!isItem[i] || hidden[i]) continue;
                const id = ids[i];
                const stored = this.geometryAt(id, beat);
                if (!stored) continue;
                const geometry = { ...stored, ...this.previews.get(id) };
                const center = { x: positions[i * 2], y: positions[i * 2 + 1] };
                const shape = outlineShape(
                    geometry.outlineType,
                    geometry.customOutline,
                    geometry.width * PIXELS_PER_METER,
                    geometry.depth * PIXELS_PER_METER,
                );
                outlines.push({
                    id,
                    points: placeOutline(shape, center, geometry.rotation),
                    closed: shape.closed,
                    geometry,
                    center,
                    color: this.colors.get(id) ?? null,
                });
            }
        }
        this.drawn = {
            version: marchers.version,
            itemsVersion: this.version,
            appearanceVersion: marchers.appearanceVersion,
            outlines,
        };
        return outlines;
    }

    /** The topmost item drawn whose Outline holds `point`, or null. */
    itemAt(point: Pt): number | null {
        const outlines = this.outlines();
        for (let i = outlines.length - 1; i >= 0; i--)
            if (insideOutline(outlines[i].points, point)) return outlines[i].id;
        return null;
    }

    /** The Outline of item `id` as drawn now, or null when it isn't drawn. */
    outlineOf(id: number): DrawnItemOutline | null {
        return this.outlines().find((outline) => outline.id === id) ?? null;
    }

    /** Item `id`'s Outline as the editor's handles see it, in field units, or null when it isn't drawn. */
    frameOf(id: number): ItemFrame | null {
        const outline = this.outlineOf(id);
        if (!outline) return null;
        const { geometry, center } = outline;
        return {
            center,
            width: geometry.width * PIXELS_PER_METER,
            depth: geometry.depth * PIXELS_PER_METER,
            rotation: geometry.rotation,
        };
    }

    /** Calls `listener` whenever the items, their Outlines or a preview change. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private geometryAt(id: number, beat: number): ItemGeometry | null {
        if (this.geometries?.beat !== beat)
            this.geometries = { beat, byId: new Map() };
        const { byId } = this.geometries;
        let geometry = byId.get(id);
        if (geometry === undefined) {
            geometry = itemGeometryAt(this.changes.get(id) ?? [], beat);
            byId.set(id, geometry);
        }
        return geometry;
    }

    private changed() {
        this.version++;
        this.emit();
    }

    private emit() {
        for (const listener of this.listeners) listener();
    }
}
