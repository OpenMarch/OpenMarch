import tolgee from "@/global/singletons/Tolgee";
import type { SavedShape } from "@/db-functions/savedShapes";
import {
    fromSaved,
    savedDistributionOf,
    type SavedDistribution,
} from "../distribute/distribution";
import type { ShapeFrame } from "../frame/frame";
import { withValue } from "../command/shapeSteps";
import type { AnyToolKind, ToolEnv, ToolParam } from "../tool/toolKind";
import type { ShapeToolEntry } from "../tool/shapeTools";
import type { XY } from "../types";
import { spacingNote, type ShapeLibraryRow } from "./shapeLibrary";
import { closedOf, distributionOf } from "../distribute/modes";

/**
 * A saved shape (#353, spec #344): a kind, its intervals and how it's filled (#393), under a
 * name, with an optional description and the dates it was saved and changed. It keeps no size and
 * no marcher count, so it fits any selection: applied to another count, the kind lays out that
 * many spots the saved distance apart, filled the saved way. It lives in the user's library across
 * shows, with a copy in each show that uses one (ADR 0006, saved shapes). Everything here is pure.
 */
export type { SavedDistribution, SavedShape };

/** A kind a saved shape opens: its own kind, set to the saved intervals as it's drawn */
export interface SavedToolKind extends AnyToolKind {
    readonly saved: SavedShape;
    /** The kind it is made from */
    readonly base: AnyToolKind;
}

export function isSavedKind(kind: AnyToolKind): kind is SavedToolKind {
    return "saved" in kind;
}

/** The basic kind a kind is: itself, or the kind a saved shape opens */
export const baseKindOf = (kind: AnyToolKind): AnyToolKind =>
    isSavedKind(kind) ? kind.base : kind;

const intervalParams = (kind: AnyToolKind) =>
    (kind.params as readonly ToolParam<unknown>[]).filter(
        (p) => p.interval && p.value,
    );

/**
 * The intervals of a shape of `kind`, in steps, by each interval parameter's key. Only those the
 * shape shows: a Line's Offset numbers are kept only for a Line measured by its offset, so a plain
 * Line saved and drawn again stays plain (drawing a saved shape sets every number it kept).
 */
export function intervalsOf(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    stepPx: number,
): Record<string, number> {
    return Object.fromEntries(
        intervalParams(kind)
            .filter((p) => !p.shown || p.shown(params, n))
            .map((p) => [p.key, p.value!(params, n, stepPx)]),
    );
}

/**
 * Why a shape of `kind` can't be saved, or null when it can. A saved shape keeps one number per
 * interval parameter, so a Line spaced by groups at different intervals (#526) would come back
 * at only one of them: it isn't offered until saved shapes can keep groups.
 */
export function whyNotSavable(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    stepPx: number,
): string | null {
    const groups = baseKindOf(kind).groups?.shown(params, n, stepPx);
    if (!groups || new Set(groups.map((g) => g.interval)).size < 2) return null;
    return tolgee.t(
        "shapes.save.mixedIntervals",
        "Lines with mixed intervals can't be saved yet",
    );
}

/**
 * What saving a shape of `kind` keeps: the kind, its intervals and how it's filled, under `name`,
 * with `description` when there is one, dated `at`
 */
export function savedShapeOf(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    stepPx: number,
    named: {
        readonly id: string;
        readonly name: string;
        readonly description?: string;
        /** Now, ISO 8601 */
        readonly at: string;
    },
): SavedShape {
    const base = baseKindOf(kind);
    const description = named.description?.trim();
    const distribution = distributionOf(base, params, n) ?? undefined;
    return {
        id: named.id,
        name: named.name.trim(),
        kind: base.shape.id,
        kindVersion: base.shape.version,
        intervals: intervalsOf(base, params, n, stepPx),
        ...(description && { description }),
        ...(distribution && {
            distribution: savedDistributionOf(distribution),
        }),
        createdAt: named.at,
        updatedAt: named.at,
    };
}

/**
 * The name saving offers: the kind and its spacing, with the stagger for Files ("Box 2 apart,
 * stagger ½"), or the mode and its spacing ("Spread 2 apart")
 */
export function suggestedName(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    stepPx: number,
): string {
    const base = baseKindOf(kind);
    const distribution = distributionOf(base, params, n) ?? undefined;
    const note = spacingNote(
        Object.values(intervalsOf(base, params, n, stepPx)),
        distribution,
    );
    if (distribution && distribution.mode !== "files" && note) return note;
    return note ? `${base.shape.label} ${note}` : base.shape.label;
}

/**
 * `params` filled the way `saved` says, read by the kind as it reads a recipe's: a Files layout
 * takes the size the shape has now, and a spread starts at seed 1. A mode the kind can't take, or
 * doesn't know, leaves `params` as they are.
 */
export function withSavedDistribution(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    saved: SavedDistribution | undefined,
    env: ToolEnv,
): unknown {
    const closed = closedOf(kind, params, n);
    if (!closed || !saved || !closed.modes.includes(saved.mode)) return params;
    const start = closed.startMode(params, n, saved.mode);
    const files = start.mode === "files" ? start.layout.files : 1;
    return closed.withDistribution(params, n, fromSaved(saved, files, n), env);
}

/**
 * `params` set to `intervals`, each by number through its parameter, as the chip and the command
 * bar set it ({@link withValue}). An interval the kind no longer has, or can't take, is left as it is.
 */
export function withIntervals(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    intervals: Readonly<Record<string, number>>,
    env: ToolEnv,
): unknown {
    let next = params;
    for (const param of intervalParams(kind)) {
        const steps = intervals[param.key];
        if (steps === undefined) continue;
        next = withValue(param, next, n, steps, env) ?? next;
    }
    return next;
}

/** `params` moved so the frame's corner toward `from` stays where `was` had it */
function keepCorner(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    was: ShapeFrame,
    from: XY,
    env: ToolEnv,
): unknown {
    const now = kind.frameOf(params, n);
    const sx = Math.sign(from.x - was.center.x) || -1;
    const sy = Math.sign(from.y - was.center.y) || -1;
    const delta = {
        x:
            was.center.x +
            sx * was.halfWidth -
            (now.center.x + sx * now.halfWidth),
        y:
            was.center.y +
            sy * was.halfDepth -
            (now.center.y + sy * now.halfDepth),
    };
    if (Math.abs(delta.x) < 1e-9 && Math.abs(delta.y) < 1e-9) return params;
    return kind.move(params, n, delta, env);
}

const KINDS = new Map<string, SavedToolKind>();

/**
 * The kind `saved` opens, made from its own kind `base`: everything is the base kind's, except
 * that drawing, turning another shape into it and the command bar's starting numbers lay the
 * spots out the saved intervals apart, filled the saved way.
 * A drawn shape keeps the corner the drag started from. The same saved shape gives the same
 * kind object, so pickers can tell which one is armed.
 */
export function savedToolKind(
    base: AnyToolKind,
    saved: SavedShape,
): SavedToolKind {
    const key = JSON.stringify([base.shape.id, saved]);
    const known = KINDS.get(key);
    if (known) return known;
    const kind: SavedToolKind = {
        ...base,
        saved,
        base,
        // Its picture fills a square with its own intervals (`fromFrame` below), not the kind's
        pictureParams: undefined,
        // The command bar starts from each parameter's default: the saved intervals here
        params: base.params.map((p) =>
            p.interval && saved.intervals[p.key] !== undefined
                ? {
                      ...p,
                      // Live, so the label follows the language (the spread copies its value)
                      get label() {
                          return p.label;
                      },
                      default: saved.intervals[p.key],
                  }
                : p,
        ),
        draw(from: XY, to: XY, n: number, env: ToolEnv, previous?: unknown) {
            const drawn = base.draw(from, to, n, env, previous);
            if (drawn === undefined) return undefined;
            const was = base.frameOf(drawn, n);
            const set = withSavedDistribution(
                base,
                withIntervals(base, drawn, n, saved.intervals, env),
                n,
                saved.distribution,
                env,
            );
            return keepCorner(base, set, n, was, from, env);
        },
        fromFrame(frame: ShapeFrame, n: number, env: ToolEnv) {
            return withSavedDistribution(
                base,
                withIntervals(
                    base,
                    base.fromFrame(frame, n, env),
                    n,
                    saved.intervals,
                    env,
                ),
                n,
                saved.distribution,
                env,
            );
        },
    };
    KINDS.set(key, kind);
    return kind;
}

/**
 * How many of the saved shapes in `library` and `show` (each once) need a newer app: a kind this
 * app doesn't have, or a newer version of one, which the Saved group leaves out
 */
export function newerSavedShapes(
    library: readonly SavedShape[],
    show: readonly SavedShape[],
    tools: readonly ShapeToolEntry[],
): number {
    const byId = new Map([...show, ...library].map((s) => [s.id, s]));
    let n = 0;
    for (const saved of byId.values()) {
        // Presets save their kind's recipe, so a saved shape is always its kind's
        const kinds = tools.filter(
            (t) => !t.kind.preset && t.kind.shape.id === saved.kind,
        );
        if (kinds.every((t) => t.kind.shape.version < saved.kindVersion)) n++;
    }
    return n;
}

/**
 * The library's Saved group: the user's saved shapes, then the ones only the open show has (a
 * show from another computer), noted as such. Each note starts with the kind, then how it's
 * spaced and filled: "Box · 2 apart, stagger ½", "Circle · Spread 2 apart". A saved shape whose
 * kind this app doesn't have, at the version it was saved with, is left out.
 */
export function savedShapeRows(
    library: readonly SavedShape[],
    show: readonly SavedShape[],
    tools: readonly ShapeToolEntry[],
): ShapeLibraryRow[] {
    const mine = new Set(library.map((s) => s.id));
    const rows = (shapes: readonly SavedShape[], inLibrary: boolean) =>
        shapes.flatMap((saved): ShapeLibraryRow[] => {
            // Its kind at the version it was saved with, as placed shapes are read back: another
            // version's intervals may mean something else, so it's left out rather than guessed.
            // Never a preset (the Curve is a Line), as placed shapes are read back (PLACED_KINDS)
            const base = tools.find(
                (t) =>
                    !t.kind.preset &&
                    t.kind.shape.id === saved.kind &&
                    t.kind.shape.version === saved.kindVersion,
            )?.kind;
            if (!base) return [];
            return [
                {
                    id: saved.id,
                    group: "saved",
                    label: saved.name,
                    kind: savedToolKind(base, saved),
                    // A saved shape has its own name, so its note says which kind it is (story
                    // 22); a getter, so it follows the app's language
                    get note() {
                        return [
                            base.shape.label,
                            spacingNote(
                                Object.values(saved.intervals),
                                saved.distribution,
                            ),
                            inLibrary
                                ? null
                                : tolgee.t(
                                      "shapes.library.note.showOnly",
                                      "this show only",
                                  ),
                        ]
                            .filter(Boolean)
                            .join(" · ");
                    },
                    saved: { shape: saved, inLibrary },
                },
            ];
        });
    return [
        ...rows(library, true),
        ...rows(
            show.filter((s) => !mine.has(s.id)),
            false,
        ),
    ];
}
