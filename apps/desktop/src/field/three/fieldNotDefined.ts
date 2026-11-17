import { sameMembers, type FieldDimming } from "./fieldDimming";

/**
 * How the field draws whether each marcher's position is decided (holds decisions 8 and 9, review
 * M8; fork #478), outside React. Two things, both read at the count the field shows:
 *
 * - **Not defined** marchers (`timelineDecided.ts`: no move, Held hold or carried shape decides
 *   them there) draw with a dashed edge (`NOT_DEFINED_LOOK`). Walking, Held, arriving and carried
 *   shape members draw solid.
 * - The label is **bold only on a keyframe**, the count where the marcher's own coordinate is set
 *   (`timelineSetFollowing.ts`); off it, the label is drawn lighter in weight.
 *
 * Its own channel next to isolation's `FieldDimming`: a Not defined marcher stays selectable and
 * draggable, so the editor's "dimmed can't be selected or hit" rules never read it, and
 * isolation's dim wins where both apply (`drawnNotDefined`). The marchers and labels layers redraw
 * when `version` changes. Playing, exports and the 3D View draw everyone solid and bold.
 *
 * On Stop the look eases in over {@link NOT_DEFINED_EASE_MS} (#302): the gaps open from a solid
 * edge and the labels thin from bold. Who's Not defined is known at once, so selecting and
 * dragging never wait on it; only how far along the look is drawn catches up, a frame at a time.
 */
export class FieldNotDefined {
    /** Goes up whenever the look changes, and on each frame of an ease. */
    version = 0;
    /** Who's Not defined and who's off a keyframe; null draws everyone solid and bold. */
    private look: FieldDecidedLook | null = null;
    private readonly listeners = new Set<() => void>();
    /** When the running ease started, or null when the look is at full strength. */
    private easeStart: number | null = null;
    private frame: number | null = null;

    constructor(private readonly clock: FadeClock = browserClock) {}

    /** Calls `listener` after each change (a layer asks for a frame). Returns the unsubscribe. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Draws `look`; null draws everyone solid and bold (playing, or before the resolver). Nothing
     * changes, and nothing redraws, when both sets are the same as before, so moving the playhead
     * between counts with the same look costs nothing here. With `ease`, the look comes in over
     * {@link NOT_DEFINED_EASE_MS} instead of at once (Stop).
     */
    set(
        look: FieldDecidedLook | null,
        { ease = false }: { ease?: boolean } = {},
    ) {
        if (look === null) this.stopEase();
        else if (ease && this.look === null) this.startEase();
        if (
            sameMembers(
                look?.notDefined ?? null,
                this.look?.notDefined ?? null,
            ) &&
            sameMembers(
                look?.offKeyframe ?? null,
                this.look?.offKeyframe ?? null,
            )
        )
            return;
        this.look = look;
        this.changed();
    }

    /** Whether the marcher is Not defined on the count shown (dashed). */
    isNotDefined(id: number): boolean {
        return this.look?.notDefined.has(id) ?? false;
    }

    /** Whether the marcher has no coordinate of its own on the count shown (its label isn't bold). */
    isOffKeyframe(id: number): boolean {
        return this.look?.offKeyframe.has(id) ?? false;
    }

    /** How far the look has come in, 0 (solid and bold) to 1 (full). */
    strength(): number {
        if (this.easeStart === null) return 1;
        const t = (this.clock.now() - this.easeStart) / NOT_DEFINED_EASE_MS;
        if (t >= 1) return 1;
        // Ease out: quick at first, settling into the look
        return 1 - (1 - Math.max(0, t)) ** 2;
    }

    private changed() {
        this.version++;
        for (const listener of this.listeners) listener();
    }

    private startEase() {
        this.easeStart = this.clock.now();
        this.requestFrame();
    }

    private stopEase() {
        this.easeStart = null;
        if (this.frame !== null) this.clock.cancelFrame(this.frame);
        this.frame = null;
    }

    private requestFrame() {
        if (this.frame !== null) return;
        this.frame = this.clock.requestFrame(() => {
            this.frame = null;
            if (this.easeStart === null) return;
            const done =
                this.clock.now() - this.easeStart >= NOT_DEFINED_EASE_MS;
            if (done) this.easeStart = null;
            else this.requestFrame();
            this.changed();
        });
    }
}

/** Who the field draws Not defined, and whose label isn't bold, at the count shown. */
export interface FieldDecidedLook {
    /** Not defined there: drawn dashed */
    readonly notDefined: ReadonlySet<number>;
    /** No coordinate of their own there: label drawn lighter (a superset of `notDefined`) */
    readonly offKeyframe: ReadonlySet<number>;
}

/** How long the look takes to come in on Stop. */
export const NOT_DEFINED_EASE_MS = 150;

/** The time and frames the ease runs on: the browser's, or a test's. */
export type FadeClock = {
    now(): number;
    requestFrame(callback: () => void): number;
    cancelFrame(handle: number): void;
};

const browserClock: FadeClock = {
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
};

/**
 * How a Not defined marcher is drawn (owner 2026-10-19, for #300's Following): its edge dashed at
 * full strength. A shape with an outline dashes the outline round its fill at
 * 60%; one without dashes its edge in its fill's color, with nothing inside.
 * An X dashes its own lines. Dashes keep the
 * shape's contrast and read by shape, not only by lightness. A label off a
 * keyframe is drawn lighter in weight at full opacity (#324), so it keeps its contrast too. The
 * marchers layer takes how far along the look is as one 0–1 value per marcher (`aNotDefined`),
 * and the labels layer thins by the same amount, so an ease can open the gaps and thin the label
 * from solid.
 */
export const NOT_DEFINED_LOOK = {
    /**
     * How much lighter the label's strokes are than a keyframe label's bold, in em
     * off each side (`TextLabel.weight`): clearly lighter, with bold Courier
     * New's curves still whole; more broke them up (#324's contact sheet).
     * Small on screen it's less, so the strokes stay whole.
     */
    labelThinning: 0.02,
    /** How opaque the fill is inside a dashed outline. */
    fillOpacity: 0.6,
    /** The dashed edge's width, in field units; never under `minEdgePx`. */
    edgeWidth: 1.75,
    minEdgePx: 2,
    /** Dashes round a circle; squares, triangles and an X's arms get three a side, corners solid. */
    circleDashes: 8,
    sideDashes: 3,
    /** How much of each dash's share a gap takes. */
    gap: 0.4,
    /**
     * Below this dot radius on screen, in CSS px, fewer, longer dashes, so the
     * gaps still show: four gaps round a circle, one a side (owner 2026-10-19:
     * dashes at any size, never a fade).
     */
    fewDashesBelowPx: 4,
    smallCircleDashes: 4,
    smallSideDashes: 2,
    /** The least a gap is, in CSS px, however small the shape. */
    minGapPx: 2,
} as const;

/**
 * How far along the dashed look a marcher is drawn (`aNotDefined`), 0 (solid) to 1 (dashed): 0
 * when decided or dimmed, partway while the look eases in on Stop.
 */
export const notDefinedAmount = (
    dimming: FieldDimming,
    look: FieldNotDefined,
    id: number,
): number => (drawnNotDefined(dimming, look, id) ? look.strength() : 0);

/** Whether a marcher is drawn Not defined (dashed): isolation's dim takes over from it. */
export const drawnNotDefined = (
    dimming: FieldDimming,
    look: FieldNotDefined,
    id: number,
): boolean => !dimming.isDimmed(id) && look.isNotDefined(id);

/**
 * How opaque a marcher's label is drawn: as its dot (isolation's dim, an open
 * shape's fade or hidden members), solid when Not defined.
 */
export const labelOpacity = (dimming: FieldDimming, id: number): number =>
    dimming.opacityOf(id);

/**
 * How much lighter a marcher's label is drawn (`TextLabel.weight`): 0 (bold) on a keyframe or when
 * dimmed, `NOT_DEFINED_LOOK.labelThinning` off a keyframe (walking, Held or Not defined alike), and
 * partway while the look eases in on Stop.
 */
export const labelWeight = (
    dimming: FieldDimming,
    look: FieldNotDefined,
    id: number,
): number =>
    !dimming.isDimmed(id) && look.isOffKeyframe(id)
        ? NOT_DEFINED_LOOK.labelThinning * look.strength()
        : 0;

/** Whether a marcher's label is drawn bold: on a keyframe, while playing, or dimmed. */
export const drawnLabelBold = (
    dimming: FieldDimming,
    look: FieldNotDefined,
    id: number,
): boolean => dimming.isDimmed(id) || !look.isOffKeyframe(id);
