import { fabric } from "fabric";
import { NoControls } from "@/components/canvas/CanvasConstants";
import CanvasMarcher, { DEFAULT_DOT_RADIUS } from "./CanvasMarcher";

/** A marcher kept on the current page, and its mark's tooltip. */
export interface TimelineKeptMark {
    readonly marcherId: number;
    readonly text: string;
}

/** The mark's side on screen: about a drill number's height, never tiny, never loud. */
const SIZE_PER_ZOOM = 12;
const MIN_SIZE = 10;
const MAX_SIZE = 16;
/** Screen pixels between the dot and the mark */
const GAP = 1.5;
/** The glyph's share of the mark; the rest is the white backing around it */
const GLYPH_SHARE = 0.86;
/** The light theme's accent, as the timeline's kept chip; the white backing reads on any field */
export const KEPT_MARK_COLOR = "rgb(100, 66, 255)";
const BACKING = "rgba(255, 255, 255, 0.95)";
const BACKING_EDGE = "rgba(0, 0, 0, 0.18)";

/** Phosphor's LinkSimpleBreak, bold (the timeline's kept chip), on its 256 × 256 grid */
const LINK_BREAK_PATH =
    "M218.45,122.43l-30.08,30.06a12,12,0,0,1-17-17l30.08-30.07a36,36,0,0,0-50.93-50.92L120.48,84.59a12,12,0,0,1-17-17l30.07-30.06a60,60,0,0,1,84.87,84.88Zm-82.93,49-30.07,30.08a36,36,0,0,1-50.92-50.93l30.06-30.07a12,12,0,0,0-17-17L37.55,133.58a60,60,0,0,0,84.88,84.87l30.06-30.07a12,12,0,0,0-17-17Z";

let glyph: Path2D | null | undefined;
/** The glyph, parsed once; null where `Path2D` doesn't exist (tests) */
const glyphPath = (): Path2D | null =>
    glyph !== undefined
        ? glyph
        : (glyph =
              typeof Path2D === "undefined"
                  ? null
                  : new Path2D(LINK_BREAK_PATH));

/** A mark's square in field coordinates: its top left corner and side. */
export interface KeptMarkBox {
    readonly x: number;
    readonly y: number;
    readonly size: number;
}

/**
 * Where the kept mark goes for a dot centered at `dot` (field coordinates) at `zoom`: just right
 * of the dot and a little below its center, clear of the drill number above it. Its side is
 * `SIZE_PER_ZOOM` field units on screen, held between 10 and 16 screen pixels.
 */
export function keptMarkBox(
    dot: { readonly x: number; readonly y: number },
    zoom: number,
    dotRadius = DEFAULT_DOT_RADIUS,
): KeptMarkBox {
    const z = zoom > 0 ? zoom : 1;
    const screen = Math.min(MAX_SIZE, Math.max(MIN_SIZE, SIZE_PER_ZOOM * z));
    const size = screen / z;
    return {
        x: dot.x + dotRadius + GAP / z,
        y: dot.y + dotRadius * 0.4 - size / 2,
        size,
    };
}

const inBox = (box: KeptMarkBox, x: number, y: number) =>
    x >= box.x && x <= box.x + box.size && y >= box.y && y <= box.y + box.size;

/**
 * The broken chains beside the dots of the marchers kept on the current page, in timeline mode
 * (docs/timeline/ui.md UI-18, kept marchers on the field). One object for every mark, above the
 * marchers, that isn't selectable and takes no events; each frame it reads the dots where they
 * are, so a drag or a redraw carries the marks along without a rebuild. Marks of hidden marchers
 * aren't drawn, and dimmed marchers' marks dim with them.
 */
export default class TimelineKeptLayer extends fabric.Object {
    marks: readonly TimelineKeptMark[];
    private marchersSeen: readonly CanvasMarcher[] | null = null;
    private byId = new Map<number, CanvasMarcher>();

    constructor({
        marks,
        width,
        height,
    }: {
        marks: readonly TimelineKeptMark[];
        width: number;
        height: number;
    }) {
        super({
            left: 0,
            top: 0,
            width,
            height,
            originX: "left",
            originY: "top",
            strokeWidth: 0,
            objectCaching: false,
            ...NoControls,
            selectable: false,
            evented: false,
            hoverCursor: "default",
        });
        this.marks = marks;
    }

    /**
     * Always drawn: the layer covers the field from (0, 0) at its size when made, but marks sit
     * beside dots anywhere, so Fabric's offscreen culling by the layer's own box would drop them
     * when the field is panned or resized (pre-merge review).
     */
    override isOnScreen(): boolean {
        return true;
    }

    update(marks: readonly TimelineKeptMark[]): void {
        this.marks = marks;
        this.dirty = true;
    }

    /** The canvas marcher of `marcherId`, from a map rebuilt when the canvas's marchers change */
    private marcherOf(marcherId: number): CanvasMarcher | undefined {
        const canvas = this.canvas as
            | (fabric.Canvas & {
                  getLiveCanvasMarchers?: () => readonly CanvasMarcher[];
              })
            | undefined;
        if (!canvas) return undefined;
        const marchers =
            canvas.getLiveCanvasMarchers?.() ??
            (canvas.getObjects().filter(CanvasMarcher.isCanvasMarcher) as
                | CanvasMarcher[]
                | undefined) ??
            [];
        if (marchers !== this.marchersSeen) {
            this.marchersSeen = marchers;
            this.byId = new Map(marchers.map((m) => [m.marcherObj.id, m]));
        }
        return this.byId.get(marcherId);
    }

    /** Each drawn mark's square, with its mark */
    boxes(): { mark: TimelineKeptMark; box: KeptMarkBox; opacity: number }[] {
        const zoom = this.canvas?.getZoom() || 1;
        const out = [];
        for (const mark of this.marks) {
            const marcher = this.marcherOf(mark.marcherId);
            if (!marcher || marcher.visible === false) continue;
            out.push({
                mark,
                box: keptMarkBox(marcher.getAbsoluteCoords(), zoom),
                opacity: marcher.opacity ?? 1,
            });
        }
        return out;
    }

    /**
     * The mark under the field point (`x`, `y`): on its square, or on its marcher's dot. Null for
     * none.
     */
    markAt(x: number, y: number): TimelineKeptMark | null {
        for (const { mark, box } of this.boxes()) {
            if (inBox(box, x, y)) return mark;
            const marcher = this.marcherOf(mark.marcherId)!;
            const dot = marcher.getAbsoluteCoords();
            if (Math.hypot(x - dot.x, y - dot.y) <= DEFAULT_DOT_RADIUS * 1.5)
                return mark;
        }
        return null;
    }

    _render(ctx: CanvasRenderingContext2D): void {
        if (this.marks.length === 0) return;
        const zoom = this.canvas?.getZoom() || 1;
        const path = glyphPath();
        ctx.save();
        // fabric puts the origin at the object's center
        ctx.translate(-(this.width ?? 0) / 2, -(this.height ?? 0) / 2);
        for (const { box, opacity } of this.boxes()) {
            ctx.globalAlpha = opacity;
            const radius = box.size * 0.28;
            ctx.beginPath();
            if (ctx.roundRect)
                ctx.roundRect(box.x, box.y, box.size, box.size, radius);
            else ctx.rect(box.x, box.y, box.size, box.size);
            ctx.fillStyle = BACKING;
            ctx.fill();
            ctx.lineWidth = 1 / zoom;
            ctx.strokeStyle = BACKING_EDGE;
            ctx.stroke();
            if (!path) continue;
            const glyphSize = box.size * GLYPH_SHARE;
            const inset = (box.size - glyphSize) / 2;
            ctx.save();
            ctx.translate(box.x + inset, box.y + inset);
            ctx.scale(glyphSize / 256, glyphSize / 256);
            ctx.fillStyle = KEPT_MARK_COLOR;
            ctx.fill(path);
            ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}
