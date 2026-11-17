import type { Checkpoint, FieldProperties } from "@openmarch/core";
import { fieldGeometry, samePosition, SETTING_KEYS } from "./fieldModel";
import type {
    CheckpointChange,
    CheckpointMove,
    CheckpointRename,
    FieldAxis,
    FieldEditDiff,
    FieldEditIssue,
    FieldValueChange,
} from "./types";

/**
 * How checkpoints before and after are paired: by id (edits, which keep ids) or by axis and
 * position (a template switch, whose ids restart at 0 and mean nothing across fields).
 */
export type CheckpointMatch = "id" | "position";

const sameValue = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);

/** A copy without keys set to undefined (templates have `fieldLabel: undefined`), so it survives JSON */
function plainCheckpoint(c: Checkpoint): Checkpoint {
    return Object.fromEntries(
        Object.entries(c).filter(([, v]) => v !== undefined),
    ) as unknown as Checkpoint;
}

/** A missing value is null in a diff, so it survives JSON */
const orNull = (v: unknown) => (v === undefined ? null : v);

/** Changes between two values, one level of nesting flattened into dotted keys */
function valueChanges(
    key: string,
    from: unknown,
    to: unknown,
): FieldValueChange[] {
    if (sameValue(from, to)) return [];
    const isObject = (v: unknown): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && !Array.isArray(v);
    if (isObject(from) && isObject(to)) {
        const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])];
        return keys
            .filter((k) => !sameValue(from[k], to[k]))
            .map((k) => ({
                key: `${key}.${k}`,
                from: orNull(from[k]),
                to: orNull(to[k]),
            }));
    }
    return [{ key, from: orNull(from), to: orNull(to) }];
}

export function settingsChanges(
    before: FieldProperties,
    after: FieldProperties,
): FieldValueChange[] {
    return SETTING_KEYS.flatMap((key) =>
        valueChanges(key, before[key], after[key]),
    );
}

function checkpointChanges(
    axis: FieldAxis,
    before: readonly Checkpoint[],
    after: readonly Checkpoint[],
    match: CheckpointMatch,
) {
    const pairs = pairCheckpoints(before, after, match);
    const added: Checkpoint[] = [];
    const moved: CheckpointMove[] = [];
    const renamed: CheckpointRename[] = [];
    const changed: CheckpointChange[] = [];
    for (const c of after) {
        const old = pairs.get(c);
        if (!old) {
            added.push(c);
            continue;
        }
        if (!samePosition(old.stepsFromCenterFront, c.stepsFromCenterFront))
            moved.push({
                axis,
                id: c.id,
                name: c.name,
                from: old.stepsFromCenterFront,
                to: c.stepsFromCenterFront,
            });
        if (old.name !== c.name || old.terseName !== c.terseName)
            renamed.push({
                axis,
                id: c.id,
                from: { name: old.name, shortName: old.terseName },
                to: { name: c.name, shortName: c.terseName },
            });
        const flags: FieldValueChange[] = [];
        for (const key of ["visible", "useAsReference"] as const)
            if (old[key] !== c[key])
                flags.push({ key, from: old[key], to: c[key] });
        // An empty label is no label
        if ((old.fieldLabel || undefined) !== (c.fieldLabel || undefined))
            flags.push({
                key: "fieldLabel",
                from: old.fieldLabel || null,
                to: c.fieldLabel || null,
            });
        if (flags.length > 0)
            changed.push({ axis, id: c.id, name: c.name, changes: flags });
    }
    const paired = new Set(pairs.values());
    const removed = before.filter((c) => !paired.has(c));
    return { added, removed, moved, renamed, changed };
}

/**
 * Each checkpoint after, paired with the one before it was (absent: added). By id; or by
 * position, where among the lines at one spot the same id pairs first, then the rest in id
 * order, each line before used once (a file with two stacked lines keeps both).
 */
function pairCheckpoints(
    before: readonly Checkpoint[],
    after: readonly Checkpoint[],
    match: CheckpointMatch,
): Map<Checkpoint, Checkpoint> {
    const pairs = new Map<Checkpoint, Checkpoint>();
    if (match === "id") {
        const byId = new Map(before.map((c) => [c.id, c]));
        for (const c of after) {
            const old = byId.get(c.id);
            if (old) {
                pairs.set(c, old);
                byId.delete(c.id);
            }
        }
        return pairs;
    }
    const free = [...before].sort((a, b) => a.id - b.id);
    const take = (old: Checkpoint, c: Checkpoint) => {
        pairs.set(c, old);
        free.splice(free.indexOf(old), 1);
    };
    const sortedAfter = [...after].sort((a, b) => a.id - b.id);
    for (const c of sortedAfter) {
        const same = free.find(
            (old) =>
                old.id === c.id &&
                samePosition(old.stepsFromCenterFront, c.stepsFromCenterFront),
        );
        if (same) take(same, c);
    }
    for (const c of sortedAfter) {
        if (pairs.has(c)) continue;
        const near = free.find((old) =>
            samePosition(old.stepsFromCenterFront, c.stepsFromCenterFront),
        );
        if (near) take(near, c);
    }
    return pairs;
}

/**
 * Everything that differs between two fields, as an edit's diff. `errors` and `warnings` are the
 * edit's own; this only compares.
 */
export function diffFieldProperties(
    edit: string,
    before: FieldProperties,
    after: FieldProperties,
    {
        match = "id",
        errors = [],
        warnings = [],
        kept,
    }: {
        match?: CheckpointMatch;
        errors?: readonly FieldEditIssue[];
        warnings?: readonly FieldEditIssue[];
        kept?: readonly string[];
    } = {},
): FieldEditDiff {
    const x = checkpointChanges(
        "x",
        before.xCheckpoints,
        after.xCheckpoints,
        match,
    );
    const y = checkpointChanges(
        "y",
        before.yCheckpoints,
        after.yCheckpoints,
        match,
    );
    const checkpoints = {
        added: [...x.added, ...y.added].map(plainCheckpoint),
        removed: [...x.removed, ...y.removed].map(plainCheckpoint),
        moved: [...x.moved, ...y.moved],
        renamed: [...x.renamed, ...y.renamed],
        changed: [...x.changed, ...y.changed],
    };
    const settings = settingsChanges(before, after);
    const geometryBefore = fieldGeometry(before);
    const geometryAfter = fieldGeometry(after);
    const empty =
        Object.values(checkpoints).every((list) => list.length === 0) &&
        settings.length === 0;
    const geometry = {
        sizeChanged:
            !samePosition(
                geometryBefore.widthSteps,
                geometryAfter.widthSteps,
            ) ||
            !samePosition(
                geometryBefore.heightSteps,
                geometryAfter.heightSteps,
            ),
        centerChanged:
            !samePosition(
                geometryBefore.centerFrontPoint.xPixels,
                geometryAfter.centerFrontPoint.xPixels,
            ) ||
            !samePosition(
                geometryBefore.centerFrontPoint.yPixels,
                geometryAfter.centerFrontPoint.yPixels,
            ),
        stepSizeChanged: !samePosition(
            geometryBefore.stepSizeInches,
            geometryAfter.stepSizeInches,
        ),
        before: geometryBefore,
        after: geometryAfter,
    };
    // Marchers are stored in canvas pixels: a new size or center moves the drill on the grid
    const resized =
        (geometry.sizeChanged || geometry.centerChanged) &&
        !warnings.some((w) => w.code === "field-resized")
            ? [fieldResized(geometry)]
            : [];
    return {
        edit,
        ok: errors.length === 0,
        empty,
        checkpoints,
        settings,
        geometry,
        errors,
        warnings: [...warnings, ...resized],
        ...(kept ? { kept } : {}),
    };
}

/** The `field-resized` issue for a geometry change */
export function fieldResized(
    geometry: FieldEditDiff["geometry"],
): FieldEditIssue {
    const { before, after } = geometry;
    return {
        code: "field-resized",
        message: `The field's size or center changes (from ${before.widthSteps} × ${before.heightSteps} steps to ${after.widthSteps} × ${after.heightSteps}); marchers keep their positions on the canvas, so they move relative to the lines`,
    };
}
