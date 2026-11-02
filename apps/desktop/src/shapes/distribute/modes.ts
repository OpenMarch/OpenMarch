import type { AnyToolKind, ToolEnv } from "../tool/toolKind";
import type { ClosedShape } from "./region";
import { edgeSplit, takesEdge } from "./distribute";
import { SPREAD_GENERATOR } from "./spread";
import {
    MODE_LABELS,
    reshuffled,
    SEED_MAX,
    spreadDistribution,
    type Distribution,
    type DistributionMode,
    type FilesLayout,
} from "./distribution";
import type { ResolvedLayout } from "./layouts";

/**
 * The mode switch's rules (spec #385), the same for the inspector and the command bar, without
 * knowing the kind. Everything is pure.
 */

/**
 * `kind`'s closed region and fill for this shape: undefined for an open kind, and for a shape of
 * a kind closed only sometimes (a Line, #529) while it's open
 */
export function closedOf(
    kind: AnyToolKind,
    params: unknown,
    n: number,
): ClosedShape<unknown> | undefined {
    const closed = kind.closed;
    if (!closed || params === null) return undefined;
    return !closed.when || closed.when(params, n) ? closed : undefined;
}

/**
 * The modes a switch offers for `kind`: its own, and none while it has only one (an open kind
 * has none). Without a shape, a kind closed only sometimes (a Line) offers none.
 */
export function switchModes(
    kind: AnyToolKind,
    shape?: { readonly params: unknown; readonly n: number },
): readonly DistributionMode[] {
    const closed = shape
        ? closedOf(kind, shape.params, shape.n)
        : kind.closed?.when
          ? undefined
          : kind.closed;
    const modes = closed?.modes ?? [];
    return modes.length > 1 ? modes : [];
}

/** How a shape of `kind` is filled now; null for an open kind or shape */
export function distributionOf(
    kind: AnyToolKind,
    params: unknown,
    n: number,
): Distribution | null {
    return closedOf(kind, params, n)?.distribution(params, n) ?? null;
}

/**
 * `params` filled in `mode`, starting from the kind's defaults for it; `params` itself when
 * it's already in that mode or the kind can't be filled that way
 */
export function withMode(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    mode: DistributionMode,
    env: ToolEnv,
): unknown {
    const closed = closedOf(kind, params, n);
    if (!closed || !closed.modes.includes(mode)) return params;
    if (closed.distribution(params, n).mode === mode) return params;
    return closed.withDistribution(
        params,
        n,
        closed.startMode(params, n, mode),
        env,
    );
}

/**
 * Reshuffle (spec #385): a spread's next seed, laid out for the `n` spots there are now; null
 * when the shape isn't a spread. One change, so one undo step.
 */
export function reshuffle(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    env: ToolEnv,
): unknown {
    const closed = closedOf(kind, params, n);
    const d = closed?.distribution(params, n);
    if (!closed || d?.mode !== "spread") return null;
    return closed.withDistribution(params, n, reshuffled(d, n), env);
}

/**
 * A spread laid out with `seed` for the `n` spots there are now (#437, for advanced users): the
 * same seed gives the same spread. Null when the shape isn't a spread or the seed isn't a whole
 * number from 1 to `SEED_MAX`. One change, so one undo step.
 */
export function withSeed(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    seed: number,
    env: ToolEnv,
): unknown {
    const closed = closedOf(kind, params, n);
    const d = closed?.distribution(params, n);
    if (!closed || d?.mode !== "spread") return null;
    if (!Number.isSafeInteger(seed) || seed < 1 || seed > SEED_MAX) return null;
    return closed.withDistribution(
        params,
        n,
        spreadDistribution(seed, n, d.edge === true),
        env,
    );
}

/** A typed seed: a whole number from 1 to `SEED_MAX`, or null */
export function parseSeed(text: string): number | null {
    const t = text.trim();
    if (!/^\d+$/.test(t)) return null;
    const seed = Number(t);
    return Number.isSafeInteger(seed) && seed >= 1 && seed <= SEED_MAX
        ? seed
        : null;
}

/** The mode a typed answer names among `modes`: its label or the start of it ("out") */
export function parseMode(
    text: string,
    modes: readonly DistributionMode[],
): DistributionMode | null {
    const t = text.trim().toLowerCase();
    if (t === "") return null;
    return (
        modes.find((m) => MODE_LABELS[m].toLowerCase().startsWith(t)) ?? null
    );
}

/**
 * The layout a shape is laid out in now, for the picker to mark: null for a kind without layouts
 * or a shape outside Files
 */
export function layoutOf(
    kind: AnyToolKind,
    params: unknown,
    n: number,
): ResolvedLayout | null {
    return closedOf(kind, params, n)?.layouts?.resolved(params, n) ?? null;
}

/**
 * `params` laid out in `layout`, its stagger kept; `params` itself for a kind without layouts or
 * a shape outside Files
 */
export function withLayout(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    layout: FilesLayout,
    env: ToolEnv,
): unknown {
    const closed = closedOf(kind, params, n);
    if (!closed?.layouts) return params;
    const d = closed.distribution(params, n);
    if (d.mode !== "files") return params;
    return closed.withDistribution(params, n, { ...d, layout }, env);
}

/**
 * Spread with an edge on or off (#450), the frame kept: one change, so one undo step. Null when
 * the shape isn't a spread, or its region has no edge to follow.
 */
export function withEdge(
    kind: AnyToolKind,
    params: unknown,
    n: number,
    on: boolean,
    env: ToolEnv,
): unknown {
    const closed = closedOf(kind, params, n);
    const d = closed?.distribution(params, n);
    if (!closed || d?.mode !== "spread") return null;
    if (!takesEdge(closed.region(params, n))) return null;
    if ((d.edge === true) === on) return params;
    // Toggled, a spread from before #439 takes the generator that has an edge, as on Reshuffle
    const { edge: _edge, ...plain } = { ...d, generator: SPREAD_GENERATOR };
    return closed.withDistribution(
        params,
        n,
        on ? { ...plain, edge: true } : plain,
        env,
    );
}

/**
 * How a spread with an edge stands its `n` marchers (#450): on the edge and inside (none inside
 * when there are too few for both). Null when the shape isn't a spread whose region has an edge.
 */
export function edgeSplitOf(
    kind: AnyToolKind,
    params: unknown,
    n: number,
): { readonly edge: number; readonly inside: number } | null {
    const closed = closedOf(kind, params, n);
    if (closed?.distribution(params, n).mode !== "spread") return null;
    const region = closed.region(params, n);
    return takesEdge(region) ? edgeSplit(region, n) : null;
}
