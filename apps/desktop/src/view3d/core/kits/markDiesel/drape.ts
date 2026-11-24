// cspell:ignore superframe superframes tarped
import {
    BufferGeometry,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    Vector3,
} from "three";
import { bowlOutline, RING_PARTS } from "../bowl";
import { Members } from "../pro/geometry";
import { DIESEL_RING } from "./bowl";
import { dieselLogoPanelTexture } from "./brand";
import type { DieselCtx, DieselPart } from "./frame";
import { CATWALK } from "./roof";

/**
 * The black drape that masks the back-sideline stand, in kit-root space
 * (`frame.ts`). Heavy pleated cloth in two hangs, as in the photos:
 *
 * - the upper hang, from the catwalk down to the ring of names, in front of
 *   the east 600s: one straight run that stops at the south end of the
 *   straight (the south-east corner has no 600s; its video board hangs
 *   there) and runs on a little past the north end, then two panels round
 *   the north-east corner's 600s that step forward and down, each with the
 *   pale hem of cloth folded over its pipe;
 * - the lower hang, in front of it, from just under the ring of names down
 *   onto the lower bowl, its foot lying over the tarped rows to the fourth
 *   row (`dieselDrapeFoot`): a center section and two wings a little behind it,
 *   each on a batten that cables hold from the catwalk (two of them through
 *   bridles). The logo panel hangs on the center section on its own
 *   lines.
 *
 * The folds are geometry, so the field's light rakes across them. What a
 * fold hides from the hall (the depth of each pleat, the seams between
 * widths of cloth) and the fall-off of the field's spill with height are
 * baked into vertex colors.
 */

/**
 * How far the upper hang wraps the north-east corner, in ring segments:
 * the half of the arc with 600s. The other half belongs to the north deck.
 */
const WRAP = RING_PARTS[5].segments / 2;
/**
 * The upper hang runs straight this far past the north end of the back
 * straight before it turns the corner (it hangs from the roof, not the
 * deck), no further than keeps it in front of the corner's 600s.
 */
const STRAIGHT_PAST = 8;
/** Each corner panel hangs this far in front of the last, and this much lower. */
const STEP_OUT = 0.9;
const STEP_DOWN = 1;
/** The lower hang's center section: half-width, and how far its top drops. */
const CENTER_HALF = 16.5;
const CENTER_DROP = 0.9;
/** The wings hang this far behind the center section. */
const WING_BACK = 0.35;
/** One width of cloth between seams, meters. */
const CLOTH_WIDTH = 3.05;
/** The hem folded over the pipe at the top of a hang. */
const HEM = 0.5;

type Tint = [number, number, number];
/** Black wool serge under cool light: albedo, linear. */
const CLOTH: Tint = [0.026, 0.03, 0.043];
const HEM_CLOTH: Tint = [0.1, 0.105, 0.125];
const BATTEN = 0x2a2c31;
const CABLE = 0xc3c7ce;
const LINE = 0x8d9199;

/** Where the cables come down to the lower hang, meters from the 50. */
const CABLES = [4, 19.3, 26.5, 35, 42, 49.5];
/** The two cables that end in a bridle, and the bridle's size. */
const BRIDLE = { x: 12.2, half: 2.4, rise: 2.6 };

/**
 * The logo panel (the app icon) on the center section, centered on
 * `DRAPE.banner.y`.
 */
const LOGO_PANEL = { size: 7.4 };

/** One level of a hang: height, depth of fold (0..1) and brightness. */
interface Row {
    y: number;
    fold: number;
    shade: number;
    tint?: Tint;
    /** How far this level lies toward the field from the hang's line. */
    out?: number;
}

/**
 * The lower hang is longer than the drop from its batten to the seats, so
 * its foot lies over the tarped rows in front of it, down the rake, and
 * ends at the front of the fourth row, about 2.9 m up. Solved from the
 * field, photos 6, 4 and 10 put the cloth's lower edge at rows 2 to 3, 3
 * and 5, a few rows above the field wall.
 */
const FOOT_ROW = 3;
/** The cloth rides this far over the tarped steps' nosings. */
const FOOT_LIFT = 0.14;

/**
 * Where the lower hang's foot ends, in kit-root space: its height (the hem
 * hangs down the third row's riser) and its outline offset from the field
 * wall.
 */
export function dieselDrapeFoot(frame: DieselCtx["frame"]): {
    y: number;
    offset: number;
} {
    const { lower } = frame.BOWL;
    return {
        y: lower.base + (FOOT_ROW - 1) * lower.rise + 0.05,
        offset: FOOT_ROW * lower.depth,
    };
}

/** Pleated cloth, collected into one indexed geometry. */
class Cloth {
    private readonly pos: number[] = [];
    private readonly normal: number[] = [];
    private readonly color: number[] = [];
    private readonly index: number[] = [];

    constructor(private readonly step: number) {}

    /**
     * Hangs cloth along `path` (plan positions, in order), between `rows`
     * (bottom to top). The folds are `depth` meters deep: behind the path
     * (`away` -1) or in front of it, toward the field (`away` 1). The cloth
     * meets the path at both ends, where it is tied off.
     */
    hang(
        path: Vector3[],
        rows: Row[],
        depth: number,
        away: 1 | -1,
        seed: number,
    ): this {
        const lengths = [0];
        for (let i = 1; i < path.length; i++)
            lengths.push(lengths[i - 1] + path[i].distanceTo(path[i - 1]));
        const total = lengths[lengths.length - 1];
        const count = Math.max(2, Math.ceil(total / this.step));
        const ds = total / count;

        // The fold profile along the hang: uneven pleats, deeper in places,
        // and a tight tuck at every seam between widths of cloth.
        const fold: number[] = [];
        const hidden: number[] = [];
        let phase = seed * 0.37;
        for (let j = 0; j <= count; j++) {
            const s = j * ds;
            const period =
                1.5 +
                0.55 * Math.sin(s * 0.31 + seed) +
                0.35 * Math.sin(s * 1.07 + seed * 2.1);
            phase += ds / period;
            const wave = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase);
            const swell =
                0.6 +
                0.25 * Math.sin(s * 0.19 + seed * 1.7) +
                0.15 * Math.sin(s * 0.83 + seed * 0.6);
            const seam = Math.abs(((s + seed) % CLOTH_WIDTH) - CLOTH_WIDTH / 2);
            const tuck = Math.exp(-((seam / 0.2) ** 2));
            const end = Math.min(1, s / 0.5, (total - s) / 0.5);
            // How far this is behind the cloth's front, 0..1.
            const recess = Math.min(1, wave * swell + 0.6 * tuck);
            fold.push(depth * end * (away < 0 ? -recess : 1 - recess));
            // The cloth turns back out of the light where it is tied off.
            hidden.push((1 - 0.5 * recess) * (0.35 + 0.65 * end));
        }

        const base = this.pos.length / 3;
        const center = new Vector3();
        const p = new Vector3();
        const t = new Vector3();
        const n = new Vector3();
        let flip = false;
        for (let j = 0; j <= count; j++) {
            const s = j * ds;
            let i = 1;
            while (i < path.length - 1 && lengths[i] < s) i++;
            const span = lengths[i] - lengths[i - 1];
            p.lerpVectors(
                path[i - 1],
                path[i],
                span > 0 ? (s - lengths[i - 1]) / span : 0,
            );
            t.subVectors(path[i], path[i - 1])
                .setY(0)
                .normalize();
            // The side of the cloth the field sees.
            n.set(-t.z, 0, t.x);
            if (n.dot(center.clone().sub(p)) < 0) n.negate();
            if (j === 0)
                flip =
                    t
                        .clone()
                        .cross(new Vector3(0, 1, 0))
                        .dot(n) < 0;
            const slope =
                (fold[Math.min(count, j + 1)] - fold[Math.max(0, j - 1)]) /
                ((Math.min(count, j + 1) - Math.max(0, j - 1)) * ds);
            for (const row of rows) {
                const d = fold[j] * row.fold + (row.out ?? 0);
                this.pos.push(p.x + n.x * d, row.y, p.z + n.z * d);
                const k = slope * row.fold;
                const len = Math.hypot(n.x - t.x * k, n.z - t.z * k);
                this.normal.push(
                    (n.x - t.x * k) / len,
                    0,
                    (n.z - t.z * k) / len,
                );
                const light = row.shade * (row.fold > 0 ? hidden[j] : 1);
                const tint = row.tint ?? CLOTH;
                this.color.push(
                    tint[0] * light,
                    tint[1] * light,
                    tint[2] * light,
                );
            }
        }
        const R = rows.length;
        for (let j = 0; j < count; j++)
            for (let r = 0; r + 1 < R; r++) {
                if (rows[r + 1].y - rows[r].y < 1e-6) continue;
                const a = base + j * R + r;
                const b = a + R;
                const [c, e] = [b + 1, a + 1];
                if (flip) this.index.push(a, c, b, a, e, c);
                else this.index.push(a, b, c, a, c, e);
            }
        return this;
    }

    build(): BufferGeometry {
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
        geo.setAttribute("normal", new Float32BufferAttribute(this.normal, 3));
        geo.setAttribute("color", new Float32BufferAttribute(this.color, 3));
        geo.setIndex(this.index);
        return geo;
    }
}

export function buildDieselDrape(ctx: DieselCtx): DieselPart {
    const { frame, shared, quality } = ctx;
    const { DRAPE, BOWL, CATWALK_Y } = frame;
    const high = quality === "high";
    const object = new Group();
    object.name = "markDiesel.drape";

    const cloth = new Cloth(high ? 0.16 : 0.42);
    const rigging = new Members();
    const at = (x: number, y: number, z: number) => new Vector3(x, y, z);

    // The upper hang follows the bowl in front of the upper deck.
    const ring = bowlOutline(BOWL.outline);
    const [back0, back1] = DIESEL_RING.back;
    // Where the straight run ends, as segments round each corner's arc.
    const arcSegments = RING_PARTS[1].segments;
    const cornerRadius =
        Math.min(
            BOWL.outline.cornerRadius,
            BOWL.outline.halfX,
            BOWL.outline.halfZ,
        ) +
        DRAPE.upper.offset -
        STEP_OUT;
    const turn =
        (Math.asin(Math.min(1, STRAIGHT_PAST / cornerRadius)) / (Math.PI / 2)) *
        arcSegments;
    const straight = ring(DRAPE.upper.offset, 0);
    // `back0` is the south end of the straight, `back1` the north end.
    const straightEnds = [
        straight[back0].clone(),
        straight[back1].clone().setX(straight[back1].x - STRAIGHT_PAST),
    ];
    /** The ring at `offset` between two (fractional) point indices. */
    const along = (offset: number, from: number, to: number): Vector3[] => {
        const points = ring(offset, 0);
        const pick = (i: number) => {
            const k = Math.floor(i);
            return new Vector3().lerpVectors(
                points[k % points.length],
                points[(k + 1) % points.length],
                i - k,
            );
        };
        const out = [pick(from)];
        for (let i = Math.floor(from) + 1; i < to; i++) out.push(pick(i));
        out.push(pick(to));
        return out;
    };
    // The straight run, then round the north-east corner two panels that
    // step forward and down: the first where the run ends, the second
    // halfway round what is left of the wrap.
    // Each panel laps the one behind it, so no seat sees between them.
    const lap = 1.5;
    const first = Math.max(0, turn - lap);
    const mid = (turn + WRAP) / 2;
    const levels: [level: number, from: number, to: number][] = [
        [0, 0, 0],
        [1, back1 + first, back1 + mid],
        [2, back1 + mid - lap, back1 + WRAP],
    ];
    levels.forEach(([level, from, to], i) => {
        const top = DRAPE.upper.top - level * STEP_DOWN;
        const { bottom } = DRAPE.upper;
        const path =
            level === 0
                ? straightEnds
                : along(DRAPE.upper.offset - level * STEP_OUT, from, to);
        cloth.hang(
            path,
            [
                { y: bottom, fold: 1, shade: 0.95 },
                { y: (bottom + top) / 2, fold: 0.9, shade: 1.15 },
                { y: top - HEM, fold: 0.6, shade: 1.3 },
                { y: top - HEM, fold: 0.25, shade: 0.8, tint: HEM_CLOTH },
                { y: top, fold: 0, shade: 1, tint: HEM_CLOTH },
            ],
            0.3,
            1,
            3 + i * 1.9,
        );
        // The pipe the cloth is folded over.
        for (let k = 1; k < path.length; k++)
            rigging.beam(
                path[k - 1].clone().setY(top),
                path[k].clone().setY(top),
                0.12,
                BATTEN,
            );
    });

    // The lower hang: the center section in the drape's plane and a wing on
    // each side behind it, each on its own batten.
    const x0 = DRAPE.centerX - DRAPE.width / 2;
    const x1 = DRAPE.centerX + DRAPE.width / 2;
    const cx = DRAPE.centerX;
    const centerTop = DRAPE.top - CENTER_DROP;
    const wingZ = DRAPE.z - WING_BACK;
    const sections: [from: number, to: number, z: number, top: number][] = [
        [x0, cx - CENTER_HALF + 0.3, wingZ, DRAPE.top],
        [cx - CENTER_HALF, cx + CENTER_HALF, DRAPE.z, centerTop],
        [cx + CENTER_HALF - 0.3, x1, wingZ, DRAPE.top],
    ];
    // Each section comes straight down to the rake behind the tarped rows
    // (`knee`), then lies over their nosings, down the rake, to the foot.
    const { lower } = BOWL;
    const foot = dieselDrapeFoot(frame);
    const nosing = (offset: number) =>
        lower.base + (offset / lower.depth) * lower.rise + FOOT_LIFT;
    sections.forEach(([from, to, z, top], i) => {
        const offset = -z - BOWL.halfZ;
        const knee = nosing(offset);
        const out = offset - foot.offset;
        cloth.hang(
            [at(from, 0, z), at(to, 0, z)],
            [
                { y: foot.y, fold: 0.3, shade: 0.7, out },
                { y: nosing(foot.offset), fold: 0.35, shade: 0.85, out },
                {
                    y: (nosing(foot.offset) + knee) / 2,
                    fold: 0.45,
                    shade: 0.95,
                    out: out / 2,
                },
                { y: knee, fold: 0.7, shade: 1 },
                { y: knee + 3.5, fold: 1, shade: 0.9 },
                { y: (knee + 3.5 + top) / 2, fold: 0.95, shade: 0.76 },
                { y: top - HEM, fold: 0.8, shade: 0.62 },
                { y: top, fold: 0.5, shade: 0.58 },
            ],
            0.34,
            -1,
            11 + i * 2.3,
        );
        rigging.beam(at(from, top, z), at(to, top, z), 0.16, BATTEN);
    });

    // Cables from the cable batten under the back catwalk to the battens.
    const catwalkZ = -frame.ROOF.superframes.z;
    const cableTop = CATWALK_Y - CATWALK.batten;
    const cable = (x: number, y: number, z: number) =>
        rigging.beam(at(x, y, z), at(x, cableTop, catwalkZ), 0.07, CABLE);
    for (const side of [-1, 1]) {
        for (const d of CABLES) {
            const x = cx + side * Math.min(d, DRAPE.width / 2 - 0.4);
            if (d < CENTER_HALF) cable(x, centerTop, DRAPE.z);
            else cable(x, DRAPE.top, wingZ);
        }
        const bx = cx + side * BRIDLE.x;
        const apex = at(bx, centerTop + BRIDLE.rise, DRAPE.z);
        for (const leg of [-1, 1])
            rigging.beam(
                at(bx + leg * BRIDLE.half, centerTop, DRAPE.z),
                apex,
                0.06,
                CABLE,
            );
        cable(bx, apex.y, DRAPE.z);
    }

    // The logo panel, on its own lines from the center batten, just proud
    // of the cloth.
    const b = DRAPE.banner;
    const panelY = b.y;
    const panelZ = DRAPE.z + 0.12;
    if (high)
        for (const side of [-1, 1]) {
            const x = cx + b.x + (side * LOGO_PANEL.size) / 2.4;
            rigging.beam(
                at(x, centerTop, panelZ - 0.04),
                at(x, panelY + LOGO_PANEL.size / 2, panelZ - 0.04),
                0.04,
                LINE,
            );
        }

    const clothMat = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        side: DoubleSide,
    });
    const clothGeo = cloth.build();
    const hangs = new Mesh(clothGeo, clothMat);
    hangs.name = "markDiesel.drapeCloth";

    const rig = rigging.build(
        shared.unitBox,
        shared.std(0xffffff, { roughness: 0.5, metalness: 0.3 }),
        "markDiesel.drapeRigging",
    );

    // Printed vinyl: lit like the cloth, with a little of its own light so
    // the lettering holds in the dark of the hall.
    const panelMap = dieselLogoPanelTexture();
    const panelMat = new MeshStandardMaterial({
        map: panelMap,
        roughness: 0.85,
        emissive: 0xffffff,
        emissiveMap: panelMap,
        emissiveIntensity: 0.16,
    });
    const panelGeo = new PlaneGeometry(LOGO_PANEL.size, LOGO_PANEL.size);
    const panel = new Mesh(panelGeo, panelMat);
    panel.name = "markDiesel.drapeLogo";
    panel.position.set(cx + b.x, panelY, panelZ);

    object.add(hangs, rig, panel);
    return {
        object,
        setLighting() {},
        dispose() {
            clothGeo.dispose();
            clothMat.dispose();
            panelGeo.dispose();
            panelMap.dispose();
            panelMat.dispose();
            rig.dispose();
            object.clear();
        },
    };
}
