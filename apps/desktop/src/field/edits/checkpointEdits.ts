import type { Checkpoint, FieldProperties } from "@openmarch/core";
import {
    checkpointsOn,
    fieldArgs,
    findCheckpoint,
    FIELD_STEP_RESOLUTION,
    MAX_CHECKPOINT_NAME_LENGTH,
    mirrorTwin,
    nextCheckpointId,
    samePosition,
    snapSteps,
    sortCheckpoints,
    swapSideNames,
    withCheckpoints,
} from "./fieldModel";
import { finishEdit, invalidArgs, isFiniteNumber } from "./finish";
import {
    autoCheckpointNames,
    autoNamesFor,
    ENGLISH_CHECKPOINT_NAMER,
    type CheckpointNamer,
} from "./naming";
import type {
    AddCheckpointArgs,
    AddCheckpointSeriesArgs,
    CheckpointRef,
    FieldAxis,
    FieldEditIssue,
    FieldEditOptions,
    FieldEditResult,
    MoveCheckpointsArgs,
    RemoveCheckpointsArgs,
    UpdateCheckpointsArgs,
} from "./types";

/** The most checkpoints one series may add (both sides counted) */
export const MAX_SERIES_CHECKPOINTS = 400;

const isAxis = (axis: unknown): axis is FieldAxis =>
    axis === "x" || axis === "y";

/** The warning for `mirror` asked of Y checkpoints, which have no other side */
function mirrorIgnored(
    mirror: boolean | undefined,
    onY: boolean,
): FieldEditIssue[] {
    return mirror && onY
        ? [
              {
                  code: "mirror-ignored",
                  axis: "y",
                  message: "Mirror applies to X checkpoints only",
              },
          ]
        : [];
}

const namerOf = (options?: FieldEditOptions): CheckpointNamer =>
    options?.namer ?? ENGLISH_CHECKPOINT_NAMER;

function occupied(checkpoints: readonly Checkpoint[], steps: number) {
    return checkpoints.some((c) => samePosition(c.stepsFromCenterFront, steps));
}

/** The checkpoints `refs` name, or the errors for those that don't exist / malformed refs */
function resolveRefs(
    fp: FieldProperties,
    refs: unknown,
): { found: Checkpoint[]; errors: FieldEditIssue[] } {
    if (!Array.isArray(refs) || refs.length === 0)
        return {
            found: [],
            errors: [invalidArgs("`ids` must list at least one { axis, id }")],
        };
    const found: Checkpoint[] = [];
    const missing: CheckpointRef[] = [];
    for (const ref of refs as unknown[]) {
        const r = ref as Partial<CheckpointRef> | null;
        if (!r || !isAxis(r.axis) || !isFiniteNumber(r.id))
            return {
                found: [],
                errors: [
                    invalidArgs(
                        'Each of `ids` must be { axis: "x" | "y", id: number }',
                    ),
                ],
            };
        const c = findCheckpoint(fp, { axis: r.axis, id: r.id });
        if (!c) missing.push({ axis: r.axis, id: r.id });
        else if (!found.includes(c)) found.push(c);
    }
    return {
        found,
        errors:
            missing.length > 0
                ? [
                      {
                          code: "not-found",
                          checkpoints: missing,
                          message: `No checkpoint ${missing.map((r) => `${r.axis}:${r.id}`).join(", ")}`,
                      },
                  ]
                : [],
    };
}

/**
 * Halfway into the largest gap between neighboring checkpoints; among equal gaps, the one
 * nearest the center (X: 0; Y: halfway front to back), then side 2 (X) or the front (Y).
 */
export function largestGapMidpoint(
    checkpoints: readonly Checkpoint[],
    axis: FieldAxis,
): number | undefined {
    const positions = [
        ...new Set(
            sortCheckpoints([...checkpoints]).map(
                (c) => c.stepsFromCenterFront,
            ),
        ),
    ];
    if (positions.length < 2) return undefined;
    const center =
        axis === "x"
            ? 0
            : (positions[0]! + positions[positions.length - 1]!) / 2;
    let best: { size: number; mid: number } | undefined;
    for (let i = 1; i < positions.length; i++) {
        const size = positions[i]! - positions[i - 1]!;
        const mid = (positions[i]! + positions[i - 1]!) / 2;
        if (!best || size > best.size + 1e-6) {
            best = { size, mid };
            continue;
        }
        if (Math.abs(size - best.size) > 1e-6) continue;
        const nearer =
            Math.abs(mid - center) < Math.abs(best.mid - center) - 1e-6;
        const tiedButLater =
            Math.abs(Math.abs(mid - center) - Math.abs(best.mid - center)) <
                1e-6 && mid > best.mid;
        if (nearer || tiedButLater) best = { size, mid };
    }
    return best!.mid;
}

function newCheckpoint(
    fp: FieldProperties,
    axis: FieldAxis,
    id: number,
    steps: number,
    namer: CheckpointNamer,
    overrides: Partial<Checkpoint> = {},
): Checkpoint {
    const auto = autoCheckpointNames(fp, axis, steps, namer);
    const checkpoint: Checkpoint = {
        id,
        axis,
        name: auto.name,
        terseName: auto.terseName,
        stepsFromCenterFront: steps,
        useAsReference: true,
        visible: true,
        ...(auto.fieldLabel ? { fieldLabel: auto.fieldLabel } : {}),
        ...overrides,
    };
    if (!checkpoint.fieldLabel) delete checkpoint.fieldLabel;
    return checkpoint;
}

function nameErrors(
    name: unknown,
    label: "name" | "shortName",
): FieldEditIssue[] {
    if (name === undefined) return [];
    if (typeof name !== "string" || name.trim() === "")
        return [invalidArgs(`\`${label}\` can't be empty`)];
    if (label === "name" && name.trim().length > MAX_CHECKPOINT_NAME_LENGTH)
        return [
            invalidArgs(
                `\`name\` can be at most ${MAX_CHECKPOINT_NAME_LENGTH} characters`,
            ),
        ];
    return [];
}

/**
 * Adds one checkpoint, and with `mirror` its twin across the center. Never on top of another
 * checkpoint; without a position it goes halfway into the largest gap nearest the center (B6).
 */
export function addCheckpoint(
    fp: FieldProperties,
    args: AddCheckpointArgs,
    options?: FieldEditOptions,
): FieldEditResult {
    const namer = namerOf(options);
    const edit = "addCheckpoint";
    if (!args || !isAxis(args.axis))
        return finishEdit(edit, fp, null, {
            errors: [invalidArgs('`axis` must be "x" or "y"')],
        });
    const { axis } = args;
    const existing = checkpointsOn(fp, axis);
    const errors = [
        ...nameErrors(args.name, "name"),
        ...nameErrors(args.shortName, "shortName"),
    ];
    let steps: number | undefined;
    if (args.steps !== undefined) {
        if (!isFiniteNumber(args.steps))
            errors.push(invalidArgs("`steps` must be a number"));
        else steps = snapSteps(args.steps);
    } else if (args.between !== undefined) {
        const pair = args.between as unknown;
        const refs = Array.isArray(pair) ? (pair as unknown[]) : [];
        const wellFormed =
            refs.length === 2 &&
            refs.every((r) => {
                const ref = r as Partial<CheckpointRef> | null;
                return !!ref && ref.axis === axis && isFiniteNumber(ref.id);
            });
        if (!wellFormed)
            errors.push(
                invalidArgs(
                    `\`between\` must be two { axis: "${axis}", id } checkpoints on the edit's axis`,
                ),
            );
        else {
            const ids = (refs as CheckpointRef[]).map((r) => r.id);
            const [a, b] = ids.map((id) => existing.find((c) => c.id === id));
            if (!a || !b)
                errors.push({
                    code: "not-found",
                    axis,
                    checkpoints: ids
                        .filter((id) => !existing.some((c) => c.id === id))
                        .map((id) => ({ axis, id })),
                    message: `No ${axis.toUpperCase()} checkpoint ${ids.join(" or ")}`,
                });
            else
                steps = snapSteps(
                    (a.stepsFromCenterFront + b.stepsFromCenterFront) / 2,
                );
        }
    } else {
        const mid = largestGapMidpoint(existing, axis);
        if (mid === undefined)
            errors.push({
                code: "no-gap",
                axis,
                message: `The ${axis.toUpperCase()} axis has no gap between two checkpoints; give \`steps\``,
            });
        else steps = snapSteps(mid);
    }
    if (errors.length > 0 || steps === undefined)
        return finishEdit(edit, fp, null, { errors });

    // Refused here rather than as an invariant, to name the spot
    if (occupied(existing, steps))
        return finishEdit(edit, fp, null, {
            errors: [
                {
                    code: "duplicate-position",
                    axis,
                    message: `There is already a ${axis.toUpperCase()} checkpoint at ${steps} steps`,
                },
            ],
        });

    const name = args.name?.trim();
    const shortName = args.shortName?.trim();
    const overrides: Partial<Checkpoint> = {
        ...(name !== undefined ? { name } : {}),
        ...(shortName !== undefined ? { terseName: shortName } : {}),
        ...(args.fieldLabel !== undefined
            ? { fieldLabel: args.fieldLabel }
            : {}),
        ...(args.visible !== undefined ? { visible: args.visible } : {}),
        ...(args.useAsReference !== undefined
            ? { useAsReference: args.useAsReference }
            : {}),
    };
    const id = nextCheckpointId(existing);
    const added = [newCheckpoint(fp, axis, id, steps, namer, overrides)];
    const warnings = mirrorIgnored(args.mirror, axis === "y");
    if (args.mirror && axis === "x" && !samePosition(steps, 0)) {
        const twin = snapSteps(-steps);
        if (occupied(existing, twin))
            warnings.push({
                code: "mirror-twin-skipped",
                axis,
                message: `Didn't add the twin at ${twin} steps: there is already an X checkpoint there`,
            });
        else {
            const swap = (s: string | undefined) =>
                s === undefined
                    ? undefined
                    : swapSideNames(s, fp.sideDescriptions);
            added.push(
                newCheckpoint(fp, axis, id + 1, twin, namer, {
                    ...overrides,
                    ...(name !== undefined ? { name: swap(name) } : {}),
                    ...(shortName !== undefined
                        ? { terseName: swap(shortName) }
                        : {}),
                }),
            );
        }
    }
    return finishEdit(
        edit,
        fp,
        withCheckpoints(fp, axis, sortCheckpoints([...existing, ...added])),
        { warnings },
    );
}

/**
 * Plain checkpoints every `every` steps from `from` to `to` (both included), named from their
 * positions, not references unless `useAsReference` says so. Positions that already have a
 * checkpoint are skipped, and said so. A series never changes the field's size or center: the
 * positions past the outermost lines on its axis are left out (`outside-field`).
 */
export function addCheckpointSeries(
    fp: FieldProperties,
    args: AddCheckpointSeriesArgs,
    options?: FieldEditOptions,
): FieldEditResult {
    const namer = namerOf(options);
    const edit = "addCheckpointSeries";
    const errors: FieldEditIssue[] = [];
    if (!args || !isAxis(args.axis))
        errors.push(invalidArgs('`axis` must be "x" or "y"'));
    if (!isFiniteNumber(args?.every) || args.every <= 0)
        errors.push(invalidArgs("`every` must be a number above 0"));
    if (!isFiniteNumber(args?.from) || !isFiniteNumber(args?.to))
        errors.push(invalidArgs("`from` and `to` must be numbers"));
    for (const key of ["useAsReference", "visible"] as const)
        if (args?.[key] !== undefined && typeof args[key] !== "boolean")
            errors.push(invalidArgs(`\`${key}\` must be true or false`));
    if (errors.length > 0) return finishEdit(edit, fp, null, { errors });

    const { axis, every, from, to } = args;
    const direction = to >= from ? 1 : -1;
    const count = Math.floor(Math.abs(to - from) / every + 1e-9) + 1;
    const mirror = !!args.mirror && axis === "x";
    if (count * (mirror ? 2 : 1) > MAX_SERIES_CHECKPOINTS)
        return finishEdit(edit, fp, null, {
            errors: [
                {
                    code: "too-many",
                    axis,
                    message: `A series adds at most ${MAX_SERIES_CHECKPOINTS} checkpoints`,
                },
            ],
        });
    const positions: number[] = [];
    for (let i = 0; i < count; i++) {
        const s = snapSteps(from + direction * i * every);
        positions.push(s);
        if (mirror && !samePosition(s, 0)) positions.push(-s);
    }
    const existing = checkpointsOn(fp, axis);
    const placed: Checkpoint[] = [...existing];
    const skipped: number[] = [];
    const outside: number[] = [];
    const extent = existing.map((c) => c.stepsFromCenterFront);
    const min = Math.min(...extent);
    const max = Math.max(...extent);
    const inside = (s: number) =>
        existing.length > 0 &&
        (s >= min || samePosition(s, min)) &&
        (s <= max || samePosition(s, max));
    const overrides: Partial<Checkpoint> = {
        useAsReference: args.useAsReference ?? false,
        visible: args.visible ?? true,
    };
    let id = nextCheckpointId(existing);
    for (const s of positions) {
        if (!inside(s)) {
            outside.push(s);
            continue;
        }
        if (occupied(placed, s)) {
            if (occupied(existing, s)) skipped.push(s);
            continue;
        }
        placed.push(newCheckpoint(fp, axis, id++, s, namer, overrides));
    }
    const warnings: FieldEditIssue[] = [
        ...mirrorIgnored(args.mirror, axis === "y"),
    ];
    if (outside.length > 0)
        warnings.push({
            code: "outside-field",
            axis,
            message: `Left out ${outside.length} position${outside.length === 1 ? "" : "s"} past the outermost ${axis.toUpperCase()} checkpoints (${outside.join(", ")}): a series doesn't change the field's size`,
        });
    if (skipped.length > 0)
        warnings.push({
            code: "skipped-existing",
            axis,
            message: `Skipped ${skipped.length} position${skipped.length === 1 ? "" : "s"} that already have a checkpoint (${skipped.join(", ")})`,
        });
    return finishEdit(
        edit,
        fp,
        withCheckpoints(fp, axis, sortCheckpoints(placed)),
        { warnings },
    );
}

/** Removes checkpoints (with `mirror`, their twins too). Refused if an axis would keep fewer than 2. */
export function removeCheckpoints(
    fp: FieldProperties,
    args: RemoveCheckpointsArgs,
    _options?: FieldEditOptions,
): FieldEditResult {
    const edit = "removeCheckpoints";
    const { found, errors } = resolveRefs(fp, args?.ids);
    if (errors.length > 0) return finishEdit(edit, fp, null, { errors });
    const doomed = new Set(found);
    if (args.mirror)
        for (const c of found) {
            const twin = mirrorTwin(fp.xCheckpoints, c);
            if (twin) doomed.add(twin);
        }
    const keep = (cs: Checkpoint[]) => cs.filter((c) => !doomed.has(c));
    return finishEdit(
        edit,
        fp,
        {
            ...fieldArgs(fp),
            xCheckpoints: keep(fp.xCheckpoints),
            yCheckpoints: keep(fp.yCheckpoints),
        },
        {
            warnings: mirrorIgnored(
                args.mirror,
                found.some((c) => c.axis === "y"),
            ),
        },
    );
}

/**
 * Moves checkpoints `by` some steps or `to` a position, snapped to the step resolution. With
 * `mirror`, X twins move to the mirrored position and the center line stays put. Refused when a
 * Y checkpoint would end up in front of the front or two checkpoints would meet.
 */
export function moveCheckpoints(
    fp: FieldProperties,
    args: MoveCheckpointsArgs,
    options?: FieldEditOptions,
): FieldEditResult {
    const namer = namerOf(options);
    const edit = "moveCheckpoints";
    const { found, errors } = resolveRefs(fp, args?.ids);
    if (errors.length > 0) return finishEdit(edit, fp, null, { errors });
    const hasBy = args.by !== undefined;
    const hasTo = args.to !== undefined;
    if (hasBy === hasTo)
        return finishEdit(edit, fp, null, {
            errors: [invalidArgs("Give `by` or `to`, not both")],
        });
    if (!isFiniteNumber(hasBy ? args.by : args.to))
        return finishEdit(edit, fp, null, {
            errors: [invalidArgs("`by` and `to` must be numbers")],
        });
    const resolution = args.snap ?? FIELD_STEP_RESOLUTION;
    if (!isFiniteNumber(resolution) || resolution < 0)
        return finishEdit(edit, fp, null, {
            errors: [invalidArgs("`snap` must be a number ≥ 0")],
        });

    // With mirror, a checkpoint whose twin is already listed follows it instead of leading
    const leaders: Checkpoint[] = [];
    const followers = new Map<Checkpoint, Checkpoint>();
    for (const c of found) {
        if (followers.has(c)) continue;
        leaders.push(c);
        if (!args.mirror) continue;
        const twin = mirrorTwin(fp.xCheckpoints, c);
        if (twin) followers.set(twin, c);
    }
    for (const c of leaders) followers.delete(c);
    if (args.mirror) {
        const centered = leaders.filter(
            (c) => c.axis === "x" && samePosition(c.stepsFromCenterFront, 0),
        );
        if (centered.length > 0)
            return finishEdit(edit, fp, null, {
                errors: [
                    {
                        code: "center-locked",
                        axis: "x",
                        checkpoints: centered.map((c) => ({
                            axis: "x",
                            id: c.id,
                        })),
                        message:
                            "With mirror on, the X checkpoint at the center stays at the center",
                    },
                ],
            });
    }
    if (hasTo && leaders.length > 1)
        return finishEdit(edit, fp, null, {
            errors: [
                invalidArgs(
                    "`to` moves one checkpoint (and its twin with mirror); use `by` for several",
                ),
            ],
        });

    const target = new Map<Checkpoint, number>();
    for (const c of leaders)
        target.set(
            c,
            snapSteps(
                hasTo ? args.to! : c.stepsFromCenterFront + args.by!,
                resolution,
            ),
        );
    for (const [twin, leader] of followers)
        target.set(twin, snapSteps(-target.get(leader)!, resolution));

    // Refused here rather than as an invariant, to name the spot, and so a line can't join lines
    // that were already stacked in an old file
    for (const axis of ["x", "y"] as const) {
        const cs = checkpointsOn(fp, axis);
        const final = cs.map((c) => ({
            c,
            steps: target.get(c) ?? c.stepsFromCenterFront,
        }));
        for (const [c, to] of target) {
            // A line that stays put (by 0) joins nothing, even where lines were already stacked
            if (c.axis !== axis || samePosition(to, c.stepsFromCenterFront))
                continue;
            const other = final.find(
                (f) => f.c !== c && samePosition(f.steps, to),
            );
            if (other)
                return finishEdit(edit, fp, null, {
                    errors: [
                        {
                            code: "duplicate-position",
                            axis,
                            checkpoints: [
                                { axis, id: c.id },
                                { axis, id: other.c.id },
                            ],
                            message: `There is already a ${axis.toUpperCase()} checkpoint at ${to} steps`,
                        },
                    ],
                });
        }
    }

    const followNames = args.followNames ?? true;
    const moveOne = (c: Checkpoint): Checkpoint => {
        const to = target.get(c);
        if (to === undefined) return c;
        const moved: Checkpoint = { ...c, stepsFromCenterFront: to };
        const was = followNames ? autoNamesFor(fp, c, namer) : undefined;
        if (was) {
            const auto = autoCheckpointNames(fp, c.axis, to, namer);
            moved.name = auto.name;
            moved.terseName = auto.terseName;
            // The yard number follows too, unless it was typed
            if ((c.fieldLabel || undefined) === was.fieldLabel) {
                if (auto.fieldLabel) moved.fieldLabel = auto.fieldLabel;
                else delete moved.fieldLabel;
            }
        }
        return moved;
    };
    return finishEdit(
        edit,
        fp,
        {
            ...fieldArgs(fp),
            xCheckpoints: sortCheckpoints(fp.xCheckpoints.map(moveOne)),
            yCheckpoints: sortCheckpoints(fp.yCheckpoints.map(moveOne)),
        },
        {
            warnings: mirrorIgnored(
                args.mirror,
                found.some((c) => c.axis === "y"),
            ),
        },
    );
}

/** Patches names, visibility, reference and field label of many checkpoints in one edit */
export function updateCheckpoints(
    fp: FieldProperties,
    args: UpdateCheckpointsArgs,
    _options?: FieldEditOptions,
): FieldEditResult {
    const edit = "updateCheckpoints";
    const { found, errors } = resolveRefs(fp, args?.ids);
    if (errors.length > 0) return finishEdit(edit, fp, null, { errors });
    const patch = args.patch;
    if (!patch || typeof patch !== "object")
        return finishEdit(edit, fp, null, {
            errors: [invalidArgs("`patch` must be an object")],
        });
    const allowed = [
        "name",
        "shortName",
        "visible",
        "useAsReference",
        "fieldLabel",
    ];
    const unknown = Object.keys(patch).filter((k) => !allowed.includes(k));
    const patchErrors = [
        ...nameErrors(patch.name, "name"),
        ...nameErrors(patch.shortName, "shortName"),
        ...(unknown.length > 0
            ? [
                  invalidArgs(
                      `\`patch\` can't set ${unknown.join(", ")} (moveCheckpoints moves; ${allowed.join(", ")} are patchable)`,
                  ),
              ]
            : []),
        ...(["visible", "useAsReference"] as const)
            .filter(
                (k) => patch[k] !== undefined && typeof patch[k] !== "boolean",
            )
            .map((k) => invalidArgs(`\`${k}\` must be true or false`)),
        ...(patch.fieldLabel !== undefined &&
        patch.fieldLabel !== null &&
        typeof patch.fieldLabel !== "string"
            ? [invalidArgs("`fieldLabel` must be text or null")]
            : []),
    ];
    if (patchErrors.length > 0)
        return finishEdit(edit, fp, null, { errors: patchErrors });

    const swap = (s: string) => swapSideNames(s, fp.sideDescriptions);
    const name = patch.name?.trim();
    const shortName = patch.shortName?.trim();
    const patches = new Map<Checkpoint, (c: Checkpoint) => Checkpoint>();
    const apply =
        (mirrored: boolean) =>
        (c: Checkpoint): Checkpoint => {
            const next: Checkpoint = { ...c };
            if (name !== undefined) next.name = mirrored ? swap(name) : name;
            if (shortName !== undefined)
                next.terseName = mirrored ? swap(shortName) : shortName;
            if (patch.visible !== undefined) next.visible = patch.visible;
            if (patch.useAsReference !== undefined)
                next.useAsReference = patch.useAsReference;
            if (patch.fieldLabel !== undefined) {
                if (patch.fieldLabel) next.fieldLabel = patch.fieldLabel;
                else delete next.fieldLabel;
            }
            return next;
        };
    for (const c of found) patches.set(c, apply(false));
    if (args.mirror)
        for (const c of found) {
            const twin = mirrorTwin(fp.xCheckpoints, c);
            if (twin && !patches.has(twin)) patches.set(twin, apply(true));
        }
    const patchAll = (cs: Checkpoint[]) =>
        cs.map((c) => patches.get(c)?.(c) ?? c);
    return finishEdit(
        edit,
        fp,
        {
            ...fieldArgs(fp),
            xCheckpoints: patchAll(fp.xCheckpoints),
            yCheckpoints: patchAll(fp.yCheckpoints),
        },
        {
            warnings: mirrorIgnored(
                args.mirror,
                found.some((c) => c.axis === "y"),
            ),
        },
    );
}
