import {
    BufferGeometry,
    Color,
    Float32BufferAttribute,
    Group,
    Mesh,
} from "three";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { GROUND_LAYER, setGroundLayer } from "../../environment";
import {
    buildFieldSurface,
    FIELD_SURFACE_Y,
    type TurfColors,
} from "../../field";
import { TURF } from "../../field/turfPlan";
import { applyTurfSheen } from "../../field/turfSheen";
import type { VenueParams } from "../../types";
import { dieselFieldArt } from "./brand";
import type { DieselCtx, DieselPart } from "./frame";

const FT = 0.3048;
const IN = FT / 12;

/** The NFL's speed blue and red (PMS 654C and 186C), for the 20-yard lines. */
const SPEED_BLUE = "#003a70";
const NFL_RED = "#c8102e";

/**
 * Mark Diesel's turf: FieldTurf-style synthetic grass, as in the reference
 * photos. Its green is a saturated yellow-green (hue about 70, saturation
 * about 0.7 in photos 1, 4, 6 and 10, against the shared turf's bluer 110),
 * not a lawn's; under this venue's lamps and exposure the base comes out
 * near `#b2c840`, as in the photos. The fibers' specular is dull
 * (`TURF_SPECULAR`): a plain dielectric's grazing Fresnel washed the far
 * field out pale. The 5-yard rolls
 * are only a little apart in the paint: most of their light and dark comes
 * from the fibers' lay against the view, with the fibers' sheen, blade
 * grain and rubber crumb on top (`surface: "synthetic"`,
 * `field/turfSheen.ts`).
 * Only the grass changes: lines, numbers and logos keep the shared paint
 * white.
 *
 * The marks follow the stadium's turf drawings (football layout plan and
 * details, revision 1.5): an 8 in goal line, red and blue lines either side
 * of each 20, an X on each 35, the 1-yard extra-point line on each 2, digits
 * 1 ft clear of the yard line with the arrow's axis 2 ft from the number's
 * top, 1-yard marks 8 in in from the sideline, and 15 ft 6 in end-zone
 * lettering with no border line. The 6 ft white border is the kit's own
 * (`buildDieselTurf`), so the field paints no frame inside it. Hashes and
 * number positions stay the show's.
 */
export const DIESEL_TURF: TurfColors = {
    base: "#8b9b2c",
    stripeDark: "#87972a",
    stripeLight: "#8f9f2f",
    surface: "synthetic",
    marks: {
        insetBorder: false,
        tickInset: 8 * IN,
        goalLine: 8 * IN,
        twenties: { goalSide: NFL_RED, fieldSide: SPEED_BLUE },
        kickoffMarks: true,
        patLines: true,
        digitGap: 1 * FT + 2 * IN,
        arrowAxis: 2 * FT,
        endZoneText: { height: 15.5 * FT, margin: 6 * FT + 2.625 * IN },
        endZoneBorder: false,
    },
};

/** The NFL's 6 ft white border round the field, outside the sidelines and end lines. */
export const DIESEL_BORDER_WIDTH = 6 * FT;

/** The yellow of the limit lines and TV boxes. */
const LIMIT_YELLOW = "#f2c318";

/**
 * The turf past the field, from the drawings' color rendering (its outline
 * gives their 92,226 sq ft and 1,195 ft of perimeter), in feet from the
 * field's edges. Along each sideline it reaches `sideCenter` out for `flat`
 * feet either side of the 50, narrowing to `sideEnd` at `sideEndX` past
 * each end line; it ends `end` past each end line, and a 45-degree cut
 * joins the two, meeting the end `cornerZ` past the sideline.
 */
export const DIESEL_TURF_OUTLINE = {
    flat: 62,
    sideCenter: 40.7,
    sideEnd: 26.5,
    sideEndX: 3,
    end: 20.5,
    cornerZ: 9,
} as const;

/**
 * The lines round the field, from the layout plan and the coaches box
 * detail, in feet: `d` out from the sideline, `x` from the 50. Both
 * sidelines have a team area between the 25s.
 */
export const DIESEL_SIDELINE = {
    /** The white restraining line: 4 in, dashed 4 ft on and 2 ft off. */
    restraining: { d: 12, width: 4 / 12, dash: 4, gap: 2 },
    /** The yellow limit line: 8 in, dashed 2 ft on and 1 ft off. */
    limit: { d: 15 + 4 / 12, width: 8 / 12, dash: 2, gap: 1 },
    /** The limit line across each end, this far past the end line. */
    endLimit: 12,
    /** The 4 in x 4 in chain markers outside the border, every 5 yards. */
    chainMarker: 4 / 12,
    team: {
        /** The front line's ends, where the white sides start (135 ft 7.5 in). */
        frontX: 135.625 / 2,
        /** The back white line, 30 ft out, and its ends (111 ft 9.5 in). */
        backD: 30,
        backX: 111.79 / 2,
        /** The 8 in yellow line behind the front line. */
        yellowWidth: 8 / 12,
        /** The yellow limit line round the area: 36 ft out, 119 ft 10 in long. */
        limitD: 36,
        limitX: 119.833 / 2,
    },
    /** The TV box at each end of a team area: an 8 in yellow parallelogram. */
    tvBox: {
        /** Its inner bottom corner, 7 ft 2.5 in past the front line's end. */
        x: 135.625 / 2 + 7.21,
        width: 6.4375,
        height: 5 + 4 / 12,
        line: 8 / 12,
    },
    /** The TV boxes' sides lean toward the team area at this angle. */
    angle: (56 * Math.PI) / 180,
} as const;

type P = [number, number];

/** Flat triangles on the ground, each wound to face up (+Y). */
class Flat {
    readonly positions: number[] = [];
    tri(a: P, b: P, c: P): void {
        const cross =
            (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
        const [p, q] = cross > 0 ? [b, c] : [c, b];
        const y = FIELD_SURFACE_Y;
        this.positions.push(a[0], y, a[1], p[0], y, p[1], q[0], y, q[1]);
    }
    /** A convex polygon, fanned from its first corner. */
    poly(points: P[]): void {
        for (let i = 1; i + 1 < points.length; i++)
            this.tri(points[0], points[i], points[i + 1]);
    }
    /** A band `width` wide centered on segment a-b. */
    band(a: P, b: P, width: number): void {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-6) return;
        const nx = (-(b[1] - a[1]) / len) * (width / 2);
        const nz = ((b[0] - a[0]) / len) * (width / 2);
        this.poly([
            [a[0] + nx, a[1] + nz],
            [b[0] + nx, b[1] + nz],
            [b[0] - nx, b[1] - nz],
            [a[0] - nx, a[1] - nz],
        ]);
    }
    /** Dashes `dash` long every `dash + gap` along a-b, starting at a. */
    dashes(a: P, b: P, width: number, dash: number, gap: number): void {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const at = (t: number): P => [
            a[0] + ((b[0] - a[0]) * t) / len,
            a[1] + ((b[1] - a[1]) * t) / len,
        ];
        for (let t = 0; t < len - 1e-6; t += dash + gap)
            this.band(at(t), at(Math.min(len, t + dash)), width);
    }
    geometry(): BufferGeometry {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
            "position",
            new Float32BufferAttribute(this.positions, 3),
        );
        geometry.computeVertexNormals();
        return geometry;
    }
}

/**
 * The turf's outline (`DIESEL_TURF_OUTLINE`) in kit-root meters, round the
 * field from the middle of the front sideline. It is convex.
 */
export function dieselTurfOutline(hx: number, hz: number): P[] {
    const o = DIESEL_TURF_OUTLINE;
    const cornerX = hx + o.sideEndX * FT;
    const flat = Math.min(o.flat * FT, cornerX);
    const quarter: P[] = [
        [0, hz + o.sideCenter * FT],
        [flat, hz + o.sideCenter * FT],
        [cornerX, hz + o.sideEnd * FT],
        [hx + o.end * FT, hz + o.cornerZ * FT],
        [hx + o.end * FT, 0],
    ];
    const out: P[] = [];
    const push = (p: P) => {
        const last = out[out.length - 1];
        if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-6)
            out.push(p);
    };
    for (const [sx, sz] of [
        [1, 1],
        [1, -1],
        [-1, -1],
        [-1, 1],
    ]) {
        const q = sx * sz > 0 ? quarter : [...quarter].reverse();
        for (const [x, z] of q) push([sx * x, sz * z]);
    }
    const [first, last] = [out[0], out[out.length - 1]];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) out.pop();
    return out;
}

/**
 * The paint round the field, in kit-root meters: the 6 ft white border, the
 * chain markers, the restraining and limit lines, and on each sideline a
 * team area with a TV box at each end.
 */
export function planDieselSideline(
    hx: number,
    hz: number,
): { white: Flat; yellow: Flat } {
    const white = new Flat();
    const yellow = new Flat();
    const S = DIESEL_SIDELINE;
    const T = S.team;
    const B = S.tvBox;
    const R = S.restraining;
    const L = S.limit;
    const tan = Math.tan(S.angle);
    const w = DIESEL_BORDER_WIDTH;
    const fieldEnd = hx / FT;

    // The border, outside the sidelines and end lines.
    const rect = (x0: number, z0: number, x1: number, z1: number) =>
        white.poly([
            [x0, z0],
            [x1, z0],
            [x1, z1],
            [x0, z1],
        ]);
    rect(-hx - w, -hz - w, hx + w, -hz);
    rect(-hx - w, hz, hx + w, hz + w);
    rect(-hx - w, -hz, -hx, hz);
    rect(hx, -hz, hx + w, hz);

    // The limit line across each end.
    const endX = hx + (S.endLimit + L.width / 2) * FT;
    const limitZ = hz + (L.d + L.width) * FT;
    for (const sx of [-1, 1])
        yellow.dashes(
            [sx * endX, -limitZ],
            [sx * endX, limitZ],
            L.width * FT,
            L.dash * FT,
            L.gap * FT,
        );

    // Line centers, in feet out from the sideline.
    const rd = R.d + R.width / 2;
    const ld = L.d + L.width / 2;
    const backD = T.backD + R.width / 2;
    const limitBackD = T.limitD - L.width / 2;
    for (const sz of [-1, 1]) {
        const at = (x: number, d: number): P => [x * FT, sz * (hz + d * FT)];

        // Chain markers on the border's outer edge, every 5 yards between
        // the goal lines.
        const m = S.chainMarker;
        for (let x = -150; x <= 150 + 1e-6; x += 15)
            if (Math.abs(x) <= fieldEnd)
                white.poly([
                    at(x - m / 2, 6),
                    at(x + m / 2, 6),
                    at(x + m / 2, 6 + m),
                    at(x - m / 2, 6 + m),
                ]);

        // Across the team area: the front white line, the yellow behind it,
        // the back white line and the back limit line.
        white.band(at(-B.x, rd), at(B.x, rd), R.width * FT);
        const sideX = (d: number) =>
            T.frontX - ((d - rd) / (backD - rd)) * (T.frontX - T.backX);
        const y0 = R.d + R.width;
        const y1 = y0 + T.yellowWidth;
        yellow.poly([
            at(-sideX(y0), y0),
            at(sideX(y0), y0),
            at(sideX(y1), y1),
            at(-sideX(y1), y1),
        ]);
        white.band(at(-T.backX, backD), at(T.backX, backD), R.width * FT);
        yellow.dashes(
            at(-T.limitX, limitBackD),
            at(T.limitX, limitBackD),
            L.width * FT,
            L.dash * FT,
            L.gap * FT,
        );

        for (const sx of [-1, 1]) {
            // The TV box: its bottom on the restraining line, its sides
            // leaning toward the team area. Its outer edge is the drawing's.
            const lean = B.height / tan;
            const bottom = R.d;
            const top = R.d + B.height;
            const corners: P[] = [
                at(sx * B.x, bottom),
                at(sx * (B.x + B.width), bottom),
                at(sx * (B.x + B.width - lean), top),
                at(sx * (B.x - lean), top),
            ];
            const cx = (corners[0][0] + corners[2][0]) / 2;
            const cz = (corners[0][1] + corners[2][1]) / 2;
            const k = (B.line * FT) / 2;
            const inward = ([x, z]: P): P => {
                const len = Math.hypot(cx - x, cz - z);
                return [x + ((cx - x) / len) * k, z + ((cz - z) / len) * k];
            };
            for (let i = 0; i < 4; i++)
                yellow.band(
                    inward(corners[i]),
                    inward(corners[(i + 1) % 4]),
                    B.line * FT,
                );

            // The restraining line, from the TV box out to the end limit.
            white.dashes(
                at(sx * (B.x + B.width), rd),
                at(sx * (fieldEnd + S.endLimit), rd),
                R.width * FT,
                R.dash * FT,
                R.gap * FT,
            );
            // The limit line, from 1 ft past the TV box's side to the end.
            const boxSide = B.x + B.width - (ld - bottom) / tan;
            yellow.dashes(
                at(sx * (boxSide + 1), ld),
                at(sx * (fieldEnd + S.endLimit), ld),
                L.width * FT,
                L.dash * FT,
                L.gap * FT,
            );

            // The team area's white side, up to the back line.
            white.band(
                at(sx * T.frontX, rd),
                at(sx * T.backX, backD),
                R.width * FT,
            );
            // The limit line's side: from the TV box's top corner up to the
            // back.
            yellow.dashes(
                at(sx * (B.x - lean), top - L.width / 2),
                at(sx * T.limitX, limitBackD),
                L.width * FT,
                L.dash * FT,
                L.gap * FT,
            );
        }
    }
    return { white, yellow };
}

/**
 * The turf past the field and the paint on it: synthetic turf out to the
 * drawings' outline (`dieselTurfOutline`; past it is the bowl's concrete
 * floor), then the white and yellow lines (`planDieselSideline`). Two
 * draw calls.
 */
export function buildDieselTurf(ctx: DieselCtx): DieselPart {
    const { frame, shared, quality } = ctx;
    const hx = frame.FIELD_HALF_LENGTH;
    const hz = frame.FIELD_HALF_WIDTH;
    const object = new Group();
    object.name = "markDiesel.turf";

    const apron = new Flat();
    const outline = dieselTurfOutline(hx, hz);
    for (let i = 0; i < outline.length; i++)
        apron.tri([0, 0], outline[i], outline[(i + 1) % outline.length]);
    const apronGeometry = apron.geometry();
    // The same synthetic turf as the field, with its rolls' lay, grain,
    // crumb and dull specular, so the apron reads as the field's turf.
    const apronMaterial = shared.std(parseInt(DIESEL_TURF.base.slice(1), 16), {
        roughness: 0.95,
    });
    applyTurfSheen(apronMaterial);
    const apronMesh = new Mesh(
        apronGeometry,
        setGroundLayer(apronMaterial, GROUND_LAYER.track),
    );
    apronMesh.name = "markDiesel.turfApron";
    apronMesh.receiveShadow = quality === "high";

    // White and yellow in one mesh, by vertex color.
    const { white, yellow } = planDieselSideline(hx, hz);
    const positions: number[] = [];
    const colors: number[] = [];
    for (const [flat, hex] of [
        [white, TURF.paint],
        [yellow, LIMIT_YELLOW],
    ] as const) {
        const c = new Color(hex);
        positions.push(...flat.positions);
        for (let i = 0; i < flat.positions.length; i += 3)
            colors.push(c.r, c.g, c.b);
    }
    const paintGeometry = new BufferGeometry();
    paintGeometry.setAttribute(
        "position",
        new Float32BufferAttribute(positions, 3),
    );
    paintGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    paintGeometry.computeVertexNormals();
    const paintMesh = new Mesh(
        paintGeometry,
        setGroundLayer(
            shared.std(0xffffff, { roughness: 0.95, vertexColors: true }),
            GROUND_LAYER.decal,
        ),
    );
    paintMesh.name = "markDiesel.sidelinePaint";
    paintMesh.receiveShadow = quality === "high";
    object.add(apronMesh, paintMesh);

    return {
        object,
        setLighting() {},
        dispose() {
            apronGeometry.dispose();
            paintGeometry.dispose();
        },
    };
}

/**
 * The stadium's own field, as its turf drawings lay it out: the pro
 * template, with the hashes at the drawings' 70 ft 9 in from each sideline
 * (the template rounds them to whole steps).
 */
export const DIESEL_FIELD: FieldProperties = (() => {
    const pro = FieldPropertiesTemplates.PRO_FOOTBALL_FIELD_WITH_END_ZONES;
    const hash = (70.75 * 12) / pro.stepSizeInches;
    const back = ((160 - 70.75) * 12) / pro.stepSizeInches;
    return new FieldProperties({
        ...pro,
        name: "Mark Diesel Stadium football field",
        yCheckpoints: pro.yCheckpoints.map((c) =>
            c.terseName === "FH"
                ? { ...c, stepsFromCenterFront: -hash }
                : c.terseName === "BH"
                  ? { ...c, stepsFromCenterFront: -back }
                  : c,
        ),
    });
})();

/**
 * The stadium's own pro football field, painted as the show's would be,
 * under a smaller show floor: the show's floor draws over it at midfield.
 * Centered on `center` (world meters). One draw call and a 4096 px texture.
 */
export function buildDieselOwnField(
    params: VenueParams,
    center: { x: number; z: number },
): { mesh: Mesh; dispose(): void } {
    const surface = buildFieldSurface({
        fieldProperties: DIESEL_FIELD,
        style: "turf",
        turf: DIESEL_TURF,
        centerArt: dieselFieldArt,
        params,
        maxTextureSize: 4096,
    });
    // Under the show's floor, over the turf round it.
    setGroundLayer(surface.mesh.material, GROUND_LAYER.decal);
    surface.mesh.position.x = center.x;
    surface.mesh.position.z = center.z;
    surface.mesh.name = "markDiesel.ownField";
    return { mesh: surface.mesh, dispose: () => surface.dispose() };
}
