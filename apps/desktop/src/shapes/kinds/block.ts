import { flatness, principalExtremes, typicalSpacing } from "../geometry/fit";
import {
    add,
    centroid,
    cross,
    dot,
    perp,
    scale,
    sub,
    unit,
    xy,
} from "../geometry/vec";
import tolgee from "@/global/singletons/Tolgee";
import type { ParamGroup, ShapeContext, ShapeKind, Slot, XY } from "../types";

/**
 * A filled block: ranks (rows) of files (columns), in the block's own frame. Local +x runs along
 * a rank (left to right), local +y from the back rank toward the front. At rotation 0 local axes
 * are the field's, so +y is toward the front sideline.
 */
export interface BlockParams {
    readonly center: XY;
    /** Radians; turns local +x from field +x toward field +y */
    readonly rotation: number;
    /** Marchers across a full rank */
    readonly files: number;
    /** Interval between files, field units */
    readonly across: number;
    /** Interval between ranks, field units */
    readonly deep: number;
    /** `offset` shifts every other rank by half the across interval (a staggered block) */
    readonly pattern: "grid" | "offset";
    /** Where the last, short rank's marchers sit along it */
    readonly shortRank: "start" | "center" | "end";
    /** Which rank is the short one: the front (absent, as recipes stored before box v1) or back */
    readonly shortRankAt?: "front" | "back";
    /**
     * The across and deep intervals are locked (the default): dragging the side changes how many
     * files there are. Unlocked, dragging the sides stretches the intervals.
     */
    readonly keepIntervals?: boolean;
    /**
     * Mirrored side to side (`flipX`) or front to back (`flipY`) in its own axes: each spot moves
     * to its mirror image, so the marcher who stood on the left stands on the right. Absent in
     * recipes stored before flips.
     */
    readonly flipX?: boolean;
    readonly flipY?: boolean;
}

const filesOf = (p: BlockParams) => Math.max(1, Math.round(p.files));
const ranksOf = (p: BlockParams, n: number) =>
    Math.max(1, Math.ceil(n / filesOf(p)));

const axes = (p: BlockParams) => {
    const ux = xy(Math.cos(p.rotation), Math.sin(p.rotation));
    return { ux, uy: perp(ux) };
};

/** Local block coordinates to field units */
const toField = (p: BlockParams, lx: number, ly: number): XY => {
    const { ux, uy } = axes(p);
    return add(p.center, add(scale(ux, lx), scale(uy, ly)));
};

const toLocal = (p: BlockParams, q: XY): { x: number; y: number } => {
    const { ux, uy } = axes(p);
    const d = sub(q, p.center);
    return { x: dot(d, ux), y: dot(d, uy) };
};

interface LocalSlot {
    readonly x: number;
    readonly y: number;
    readonly row: number;
    readonly col: number;
}

/** Slots in the block's frame, row-major from the back rank, left to right */
function localSlots(p: BlockParams, n: number): LocalSlot[] {
    if (n <= 0) return [];
    const files = filesOf(p);
    const ranks = ranksOf(p, n);
    const slots: LocalSlot[] = [];
    const shortRow = p.shortRankAt === "back" ? 0 : ranks - 1;
    for (let row = 0; row < ranks; row++) {
        const inRank = row === shortRow ? n - (ranks - 1) * files : files;
        // A short rank's first file: flush left, centered (may sit between files) or flush right
        const lead =
            p.shortRank === "end"
                ? files - inRank
                : p.shortRank === "center"
                  ? (files - inRank) / 2
                  : 0;
        // Staggered: alternate ranks half an interval apart, split either side so the block
        // stays centered
        const shift =
            p.pattern === "offset" && ranks > 1
                ? row % 2 === 1
                    ? 0.25
                    : -0.25
                : 0;
        const y = (row - (ranks - 1) / 2) * p.deep;
        for (let i = 0; i < inRank; i++) {
            const file = lead + i;
            const x = (file - (files - 1) / 2 + shift) * p.across;
            slots.push({
                x: p.flipX ? -x : x,
                y: p.flipY ? -y : y,
                row,
                col: Math.floor(file),
            });
        }
    }
    return slots;
}

/** Half the block's size along each local axis, for the size handles (never zero-length) */
const halfSize = (p: BlockParams, n: number) => ({
    x: (Math.max(filesOf(p) - 1, 1) * p.across) / 2,
    y: (Math.max(ranksOf(p, n) - 1, 1) * p.deep) / 2,
});

const snapRotation = (angle: number, stepRad: number) => {
    const snapped = Math.round(angle / stepRad) * stepRad;
    return snapped === 0 ? 0 : snapped;
};

const ROTATE_OFFSET = Math.PI / 2;

const trim = (v: number) => String(Math.round(v * 100) / 100);

/** The block's pattern group: how its ranks sit, and where a short rank goes */
function patternGroup(): ParamGroup<BlockParams> {
    return {
        label: tolgee.t("shapes.kinds.block.pattern", "Pattern"),
        fields: [
            {
                type: "enum",
                key: "pattern",
                label: tolgee.t("shapes.kinds.block.ranks.label", "Ranks"),
                options: [
                    {
                        value: "grid",
                        label: tolgee.t(
                            "shapes.kinds.block.ranks.grid",
                            "Grid",
                        ),
                    },
                    {
                        value: "offset",
                        label: tolgee.t(
                            "shapes.kinds.block.ranks.staggered",
                            "Staggered",
                        ),
                    },
                ],
            },
            {
                type: "enum",
                key: "shortRank",
                label: tolgee.t(
                    "shapes.kinds.block.shortRank.label",
                    "Short rank",
                ),
                options: [
                    {
                        value: "start",
                        label: tolgee.t(
                            "shapes.kinds.block.shortRank.left",
                            "Left",
                        ),
                    },
                    {
                        value: "center",
                        label: tolgee.t(
                            "shapes.kinds.block.shortRank.center",
                            "Center",
                        ),
                    },
                    {
                        value: "end",
                        label: tolgee.t(
                            "shapes.kinds.block.shortRank.right",
                            "Right",
                        ),
                    },
                ],
            },
        ],
    };
}

/** The block's panel groups, built when read so they're in the current language */
function blockGroups(): ParamGroup<BlockParams>[] {
    return [
        {
            label: tolgee.t("shapes.kinds.block.size", "Size"),
            fields: [
                {
                    type: "count",
                    key: "files",
                    label: tolgee.t("shapes.kinds.block.files", "Files"),
                    min: 1,
                },
                {
                    type: "length",
                    key: "across",
                    label: tolgee.t("shapes.kinds.block.across", "Across"),
                },
                {
                    type: "length",
                    key: "deep",
                    label: tolgee.t("shapes.kinds.block.deep", "Deep"),
                },
                {
                    type: "lock",
                    key: "keepIntervals",
                    label: tolgee.t(
                        "shapes.kinds.block.keepIntervals.label",
                        "Keep intervals",
                    ),
                    lockedHelp: tolgee.t(
                        "shapes.kinds.block.keepIntervals.locked",
                        "Intervals locked: dragging the side adds or removes files. Click to stretch the intervals instead",
                    ),
                    unlockedHelp: tolgee.t(
                        "shapes.kinds.block.keepIntervals.unlocked",
                        "Dragging the side stretches the intervals. Click to lock them, so it adds or removes files",
                    ),
                },
            ],
        },
        patternGroup(),
        {
            label: tolgee.t("shapes.kinds.block.rotation", "Rotation"),
            advanced: true,
            fields: [
                {
                    type: "angle",
                    key: "rotation",
                    label: tolgee.t("shapes.kinds.block.rotation", "Rotation"),
                },
            ],
        },
    ];
}

export const blockKind: ShapeKind<BlockParams> = {
    id: "block",
    version: 1,
    get label() {
        return tolgee.t("shapes.kinds.block.label", "Box");
    },
    family: "fill",
    get groups() {
        return blockGroups();
    },

    fit({ current }, ctx: ShapeContext) {
        const n = current.length;
        const ends = principalExtremes(current);
        let rotation = 0;
        let files = Math.max(1, Math.round(Math.sqrt(n)));
        // A rough row keeps its direction; anything else starts square to the field
        if (ends && flatness(current) <= 0.35) {
            const axis = unit(sub(ends[1], ends[0]));
            rotation = snapRotation(Math.atan2(axis.y, axis.x), Math.PI / 2);
            const straight = current.every(
                (q) =>
                    Math.abs(cross(axis, sub(q, ends[0]))) <= 0.25 * ctx.stepPx,
            );
            // A straight line becomes two ranks: one rank would look the same as the line
            // (sims, round 15: "Block came up identical to my line")
            if (straight && n <= 16) files = Math.max(1, Math.ceil(n / 2));
        }
        const spacing = typicalSpacing(current, ctx.stepPx);
        return {
            center: n === 0 ? xy(0, 0) : centroid(current),
            rotation,
            files,
            // The marchers' own spacing, so the block opens through where they stand
            across: spacing,
            deep: spacing,
            pattern: "grid",
            shortRank: "start",
            keepIntervals: true,
        };
    },

    handles(p, n, ctx) {
        const half = halfSize(p, n);
        const out = handleOffset(ctx);
        const backRank = -((ranksOf(p, n) - 1) / 2) * p.deep;
        const reach = Math.max(Math.abs(p.deep), 1);
        return [
            // In front of the front rank, off the marchers (sims, round 11)
            { key: "move", role: "move", at: moveHandleAt(p, n, ctx) },
            {
                key: "rotate",
                role: "rotate",
                hint: tolgee.t("shapes.kinds.block.hint.turn", "Turn"),
                at: toField(p, 0, backRank - reach),
            },
            {
                key: "across",
                role: "bulge",
                at: toField(p, half.x + out, 0),
                hint: p.keepIntervals
                    ? tolgee.t("shapes.kinds.block.hint.files", "Files")
                    : tolgee.t(
                          "shapes.kinds.block.hint.intervalAcross",
                          "Interval across",
                      ),
            },
            // With the intervals kept, the ranks follow the files, so depth has no handle
            ...(p.keepIntervals
                ? []
                : [
                      {
                          key: "deep",
                          role: "bulge" as const,
                          hint: tolgee.t(
                              "shapes.kinds.block.hint.intervalDeep",
                              "Interval deep",
                          ),
                          at: toField(p, 0, half.y + out),
                      },
                  ]),
        ];
    },

    drag(p, key, to, { constrain }, n, ctx) {
        const out = handleOffset(ctx);
        if (key === "move") {
            const at = moveHandleAt(p, n, ctx);
            return {
                ...p,
                center: {
                    x: p.center.x + to.x - at.x,
                    y: p.center.y + to.y - at.y,
                },
            };
        }
        if (key === "rotate") {
            // The handle stands behind the block (local -y), a quarter turn from local +x.
            const d = sub(to, p.center);
            if (d.x === 0 && d.y === 0) return p;
            const angle = Math.atan2(d.y, d.x) + ROTATE_OFFSET;
            return {
                ...p,
                rotation: constrain ? snapRotation(angle, Math.PI / 12) : angle,
            };
        }
        if (key === "across") {
            const along = Math.max(Math.abs(toLocal(p, to).x) - out, 0);
            if (p.keepIntervals) {
                // Whole files at the kept interval, one per interval dragged, never more than
                // there are marchers. The opposite side stays where it is.
                const left = -((filesOf(p) - 1) / 2) * p.across;
                const reach = toLocal(p, to).x - out - left;
                const files = Math.min(
                    Math.max(
                        Math.round(reach / Math.max(p.across, 1e-9)) + 1,
                        1,
                    ),
                    Math.max(n, 1),
                );
                const middle = left + ((files - 1) / 2) * p.across;
                return { ...p, files, center: toField(p, middle, 0) };
            }
            return { ...p, across: (2 * along) / Math.max(filesOf(p) - 1, 1) };
        }
        if (key === "deep") {
            const along = Math.max(Math.abs(toLocal(p, to).y) - out, 0);
            return {
                ...p,
                deep: (2 * along) / Math.max(ranksOf(p, n) - 1, 1),
            };
        }
        return p;
    },

    outline(p, n) {
        const slots = localSlots(p, n);
        if (slots.length === 0) return [];
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const s of slots) {
            x0 = Math.min(x0, s.x);
            x1 = Math.max(x1, s.x);
            y0 = Math.min(y0, s.y);
            y1 = Math.max(y1, s.y);
        }
        const corners = [
            toField(p, x0, y0),
            toField(p, x1, y0),
            toField(p, x1, y1),
            toField(p, x0, y1),
        ];
        return [[...corners, corners[0]!]];
    },

    generate: (p, n): Slot[] =>
        localSlots(p, n).map((s) => ({
            ...toField(p, s.x, s.y),
            row: s.row,
            col: s.col,
        })),

    orderKey(p, point, _ctx, n) {
        const turned = toLocal(p, point);
        // Drill order mirrors with the box
        const local = {
            x: p.flipX ? -turned.x : turned.x,
            y: p.flipY ? -turned.y : turned.y,
        };
        const ranks = ranksOf(p, n);
        const rank =
            p.deep === 0 ? 0 : Math.round(local.y / p.deep + (ranks - 1) / 2);
        return [rank, local.x];
    },

    readouts(p, n, ctx) {
        return [
            {
                label: tolgee.t(
                    "shapes.kinds.block.readout.ranksFiles",
                    "Ranks × files",
                ),
                value: `${ranksOf(p, n)} × ${filesOf(p)}`,
            },
            {
                label: tolgee.t(
                    "shapes.kinds.block.readout.interval",
                    "Interval",
                ),
                value: tolgee.t(
                    "shapes.kinds.block.readout.intervalValue",
                    "{across} × {deep} steps",
                    {
                        across: trim(p.across / ctx.stepPx),
                        deep: trim(p.deep / ctx.stepPx),
                    },
                ),
            },
        ];
    },

    validate(p, slots) {
        if (!(p.files >= 1)) {
            return [
                {
                    level: "error",
                    message: tolgee.t(
                        "shapes.kinds.block.validate.noFiles",
                        "A block needs at least 1 file",
                    ),
                },
            ];
        }
        const files = filesOf(p);
        const lastRank = slots.length % files;
        if (slots.length > files && lastRank === 1) {
            return [
                {
                    level: "info",
                    message: tolgee.t(
                        "shapes.kinds.block.validate.lastRankOne",
                        "With {files, plural, one {# file} other {# files}} the last rank has 1 marcher",
                        { files },
                    ),
                },
            ];
        }
        return [];
    },
};

/**
 * How far the size handles stand outside the block's edge files and ranks, so they don't sit on
 * the end marchers and hide their numbers (sims, round 7). Drags take it back off.
 */
function handleOffset(ctx: ShapeContext): number {
    return 1.5 * ctx.stepPx;
}

/** The move handle: a step and a half in front of the block's front rank, at its middle */
function moveHandleAt(p: BlockParams, n: number, ctx: ShapeContext): XY {
    const frontRank = ((ranksOf(p, n) - 1) / 2) * p.deep;
    return toField(p, 0, frontRank + handleOffset(ctx));
}
