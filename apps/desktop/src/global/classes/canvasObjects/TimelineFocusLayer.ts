import { fabric } from "fabric";
import { NoControls } from "@/components/canvas/CanvasConstants";
import type {
    FocusPoint,
    FocusPolyline,
    FocusScene,
} from "@/timeline/timelineFocusScene";
import TimelinePathway from "./TimelinePathway";

/** Sizes in screen pixels; the layer divides them by the zoom (07-ghost-rendering.md §2). */
const PERFORMED_WIDTH = 2;
const GHOST_WIDTH = 1.5;
const CONTEXT_WIDTH = 1.5;
const CONTEXT_ALPHA = 0.6;
/** Not [5, 3]: that dash is the step-size warning's (07 §2, Dash conflict) */
const GHOST_DASH = [2, 4] as const;
const DOT_RADIUS = 3;
const GHOST_DOT_RADIUS = 4;
const FORK_RADIUS = 3.5;
/** Paths of members outside the selection, and rings of members who hold still */
const BACKGROUND_ALPHA = 0.25;
const HOLD_ALPHA = 0.4;

/**
 * Everything an isolated timeline draws on the field (docs/timeline/research/ownership/09-isolation.md), as one
 * object that isn't selectable and takes no events: performed paths, gray dashed ghosts, context
 * moves, start rings, destination dots, gray ghost end dots and fork marks. One object instead of
 * one per path keeps a 200-marcher scene cheap (07 §5). Stroke widths, dashes and dot sizes stay
 * the same on screen at any zoom.
 */
export default class TimelineFocusLayer extends fabric.Object {
    scene: FocusScene;
    ghostColor: string;
    /** With marchers selected, only theirs are drawn at full strength */
    emphasis: ReadonlySet<number> | null;

    constructor({
        scene,
        ghostColor,
        emphasis = null,
        width,
        height,
    }: {
        scene: FocusScene;
        ghostColor: string;
        emphasis?: ReadonlySet<number> | null;
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
        this.scene = scene;
        this.ghostColor = ghostColor;
        this.emphasis = emphasis;
    }

    update(
        scene: FocusScene,
        ghostColor: string,
        emphasis: ReadonlySet<number> | null,
    ): void {
        this.scene = scene;
        this.ghostColor = ghostColor;
        this.emphasis = emphasis;
        this.dirty = true;
    }

    /** A member's strength: full, or stepped back when others are selected */
    private alphaOf(marcherId: number): number {
        return this.emphasis === null || this.emphasis.has(marcherId)
            ? 1
            : BACKGROUND_ALPHA;
    }

    // eslint-disable-next-line max-lines-per-function
    _render(ctx: CanvasRenderingContext2D): void {
        const zoom = this.canvas?.getZoom() || 1;
        const px = (n: number) => n / zoom;
        const o = TimelinePathway.gridOffset;
        const { scene, ghostColor } = this;
        ctx.save();
        // fabric puts the origin at the object's center
        ctx.translate(-(this.width ?? 0) / 2, -(this.height ?? 0) / 2);
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        const line = (points: FocusPolyline) => {
            if (points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(points[0]!.x + o, points[0]!.y + o);
            for (let i = 1; i < points.length; i++)
                ctx.lineTo(points[i]!.x + o, points[i]!.y + o);
            ctx.stroke();
        };
        const dot = (p: FocusPoint, r: number) => {
            ctx.beginPath();
            ctx.arc(p.x + o, p.y + o, px(r), 0, Math.PI * 2);
        };

        // 1. Context moves: the move each member leaves for
        ctx.lineWidth = px(CONTEXT_WIDTH);
        ctx.setLineDash([]);
        for (const path of scene.context) {
            ctx.globalAlpha = CONTEXT_ALPHA * this.alphaOf(path.marcherId);
            ctx.strokeStyle = path.color;
            line(path.points);
        }

        // Where each member another move took really ends up: the end of that move's path
        for (const path of scene.context) {
            const end = path.points[path.points.length - 1];
            if (!end) continue;
            ctx.globalAlpha = this.alphaOf(path.marcherId);
            ctx.fillStyle = path.color;
            dot(end, DOT_RADIUS);
            ctx.fill();
        }

        // 2. Ghosts: the isolated move's plan where it no longer has the member
        ctx.strokeStyle = ghostColor;
        ctx.lineWidth = px(GHOST_WIDTH);
        ctx.setLineDash(GHOST_DASH.map(px));
        for (const slot of scene.slots) {
            ctx.globalAlpha = this.alphaOf(slot.marcherId);
            for (const g of slot.ghosts) line(g);
        }
        ctx.setLineDash([]);

        // 3. Performed paths
        ctx.strokeStyle = scene.color;
        ctx.lineWidth = px(PERFORMED_WIDTH);
        for (const slot of scene.slots) {
            if (slot.holds) continue;
            ctx.globalAlpha = this.alphaOf(slot.marcherId);
            for (const p of slot.performed) line(p);
        }

        // 4. Dots: start rings, destinations, ghost ends, forks. One who holds still gets only a
        // quiet ring
        for (const slot of scene.slots) {
            const alpha = this.alphaOf(slot.marcherId);
            ctx.globalAlpha = slot.holds ? HOLD_ALPHA * alpha : alpha;
            ctx.strokeStyle = scene.color;
            ctx.lineWidth = px(1.5);
            dot(slot.origin, DOT_RADIUS);
            ctx.stroke();
            if (slot.holds) continue;
            ctx.globalAlpha = alpha;
            if (slot.destination) {
                ctx.fillStyle = scene.color;
                dot(slot.destination, DOT_RADIUS);
                ctx.fill();
            }
            if (slot.ghostEnd) {
                ctx.globalAlpha = 0.45 * alpha;
                ctx.fillStyle = ghostColor;
                dot(slot.ghostEnd, GHOST_DOT_RADIUS);
                ctx.fill();
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = ghostColor;
                ctx.lineWidth = px(1.5);
                dot(slot.ghostEnd, GHOST_DOT_RADIUS);
                ctx.stroke();
            }
            for (const fork of slot.forks) {
                ctx.fillStyle = fork.color;
                dot(fork, FORK_RADIUS);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}
