import tolgee from "@/global/singletons/Tolgee";
import { centroid, dist, sub, xy } from "../geometry/vec";
import {
    autoEdgeCount,
    boxOutline,
    circleOutline,
    naturalFill,
    typicalNeighborDistance,
    type FillOutline,
} from "../geometry/naturalFill";
import type { ShapeContext, ShapeKind, Slot, XY } from "../types";
import type { BlockParams } from "./block";

/**
 * A filled shape with a natural spread (owner decisions, 2026-10-11): marchers spread evenly but
 * irregularly over a circle or a box, some on the edge so the silhouette reads. It has no
 * interval: where it is, how big, and how many marchers decide the spacing, shown as a readout.
 * The edge count is automatic unless set, and each layout number is a different spread.
 *
 * The draw tool reaches it through a shape's Outline / Filled switch rather than its own button.
 */
export interface FillParams {
    readonly outline: "circle" | "box";
    readonly center: XY;
    /** Circle radius */
    readonly r: number;
    /** Box size and turn */
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    /** Marchers on the edge; 0 for the automatic count */
    readonly edge: number;
    /** Which spread (1, 2, 3, ...); the same number gives the same spread */
    readonly layout: number;
    /** The ranks and files this came from, so switching back to Grid gives them back */
    readonly block?: BlockParams;
}

export function fillOutline(p: FillParams): FillOutline {
    return p.outline === "circle"
        ? circleOutline(p.center, p.r)
        : boxOutline(p.center, p.width, p.height, p.rotation);
}

/** Spreads are worked out once per params; previews ask for the same one many times */
const spreads = new Map<string, XY[]>();
const SPREADS_KEPT = 24;

function spread(p: FillParams, n: number): XY[] {
    const key = JSON.stringify([p, n]);
    const known = spreads.get(key);
    if (known) return known;
    const spots = naturalFill(
        fillOutline(p),
        n,
        p.edge > 0 ? p.edge : undefined,
        p.layout,
    );
    spreads.set(key, spots);
    if (spreads.size > SPREADS_KEPT)
        spreads.delete(spreads.keys().next().value!);
    return spots;
}

/** Steps to one decimal, as a number so the readout writes it in the app's language */
const steps = (v: number, ctx: ShapeContext) =>
    Math.round((v / ctx.stepPx) * 10) / 10;

/** The box's local axes */
const localOf = (p: FillParams, q: XY) => {
    const d = sub(q, p.center);
    const c = Math.cos(p.rotation);
    const s = Math.sin(p.rotation);
    return { x: d.x * c + d.y * s, y: -d.x * s + d.y * c };
};
const fieldOf = (p: FillParams, lx: number, ly: number): XY => {
    const c = Math.cos(p.rotation);
    const s = Math.sin(p.rotation);
    return xy(p.center.x + lx * c - ly * s, p.center.y + lx * s + ly * c);
};

export const fillKind: ShapeKind<FillParams> = {
    id: "fill",
    version: 1,
    get label() {
        return tolgee.t("shapes.kinds.fill.label", "Filled");
    },
    family: "fill",
    defaultOrder: "nearest",
    groups: [
        {
            get label() {
                return tolgee.t("shapes.kinds.fill.group", "Fill");
            },
            fields: [
                {
                    type: "count",
                    key: "edge",
                    get label() {
                        return tolgee.t(
                            "shapes.kinds.fill.edgeField",
                            "Edge (0 = auto)",
                        );
                    },
                    min: 0,
                },
                {
                    type: "count",
                    key: "layout",
                    get label() {
                        return tolgee.t("shapes.kinds.fill.layout", "Layout");
                    },
                    min: 1,
                },
            ],
        },
    ],
    measures: [
        {
            key: "radius",
            get label() {
                return tolgee.t("shapes.kinds.measure.radius", "Radius");
            },
            unit: "length",
            min: 0.25,
            size: true,
            visibleWhen: (p) => p.outline === "circle",
            get: (p) => p.r,
            set: (p, r) => ({ ...p, r }),
        },
        {
            key: "width",
            get label() {
                return tolgee.t("shapes.kinds.measure.width", "Width");
            },
            unit: "length",
            min: 0.25,
            size: true,
            visibleWhen: (p) => p.outline === "box",
            get: (p) => p.width,
            set: (p, width) => ({ ...p, width }),
        },
        {
            key: "height",
            get label() {
                return tolgee.t("shapes.kinds.measure.depth", "Depth");
            },
            unit: "length",
            min: 0.25,
            size: true,
            visibleWhen: (p) => p.outline === "box",
            get: (p) => p.height,
            set: (p, height) => ({ ...p, height }),
        },
    ],

    fit({ current }, ctx) {
        const center = current.length ? centroid(current) : xy(0, 0);
        // Room for everyone about two steps apart
        const r = Math.max(
            2 * ctx.stepPx,
            Math.sqrt(current.length) * ctx.stepPx * 1.1,
        );
        return {
            outline: "circle",
            center,
            r,
            width: 2 * r,
            height: 2 * r,
            rotation: 0,
            edge: 0,
            layout: 1,
        };
    },

    handles(p) {
        if (p.outline === "circle")
            return [
                { key: "move", role: "move", at: p.center },
                {
                    key: "radius",
                    role: "point",
                    at: xy(p.center.x + p.r, p.center.y),
                    hint: tolgee.t("shapes.kinds.measure.radius", "Radius"),
                },
            ];
        return [
            { key: "move", role: "move", at: p.center },
            {
                key: "corner",
                role: "point",
                at: fieldOf(p, p.width / 2, p.height / 2),
                hint: tolgee.t("shapes.kinds.fill.hint.size", "Size"),
            },
        ];
    },

    drag(p, key, to) {
        if (key === "move") return { ...p, center: to };
        if (key === "radius") return { ...p, r: dist(p.center, to) };
        if (key === "corner") {
            const l = localOf(p, to);
            return {
                ...p,
                width: 2 * Math.abs(l.x),
                height: 2 * Math.abs(l.y),
            };
        }
        return p;
    },

    outline(p) {
        if (p.outline === "box") {
            // The corners (quarter points of the edge are corners only on a square)
            const hw = p.width / 2;
            const hh = p.height / 2;
            const corners = [
                fieldOf(p, -hw, hh),
                fieldOf(p, hw, hh),
                fieldOf(p, hw, -hh),
                fieldOf(p, -hw, -hh),
            ];
            return [[...corners, corners[0]!]];
        }
        const outline = fillOutline(p);
        const points = Array.from({ length: 73 }, (_, i) =>
            outline.pointAt(i / 72),
        );
        return [points];
    },

    generate: (p, n): Slot[] => spread(p, n).map((q) => ({ x: q.x, y: q.y })),

    // Front to back, then left to right: the nearest thing a spread has to ranks and files
    orderKey: (p, point) => {
        const l = localOf(p, point);
        return [-l.y, l.x];
    },

    readouts(p, n, ctx) {
        const spots = spread(p, n);
        const edge =
            p.edge > 0 ? Math.min(p.edge, n) : autoEdgeCount(fillOutline(p), n);
        return [
            {
                label: tolgee.t("shapes.kinds.fill.readout.about", "About"),
                value: tolgee.t(
                    "shapes.kinds.fill.readout.apart",
                    "{steps, plural, one {# step apart} other {# steps apart}}",
                    { steps: steps(typicalNeighborDistance(spots), ctx) },
                ),
            },
            {
                label: tolgee.t("shapes.kinds.fill.readout.edge", "Edge"),
                value:
                    p.edge > 0
                        ? `${edge}`
                        : tolgee.t(
                              "shapes.kinds.fill.readout.edgeAuto",
                              "{count} (auto)",
                              { count: edge },
                          ),
            },
        ];
    },

    validate(p) {
        const size = p.outline === "circle" ? p.r : Math.min(p.width, p.height);
        return size > 0
            ? []
            : [
                  {
                      level: "error",
                      message: tolgee.t(
                          "shapes.kinds.fill.validate.noSize",
                          "The shape has no size",
                      ),
                  },
              ];
    },
};
