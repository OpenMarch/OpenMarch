// cspell:words glsl
/**
 * A silk's motion (props-spec.md section 7, ADR 0010 D-17): a stateless
 * wave over a flat grid, evaluated per vertex from the show clock, a phase
 * seed, the performer's ground speed and turn rate. The silk prototype's
 * motion variant B, "hang and billow" (`prototype/silk-look`): the fly sags
 * off the pole at rest, and lifts and fills out into a belly with speed.
 *
 * Nothing carries over from one frame to the next, so a seek or a scrub
 * lands on the same surface every time. The shader (`SILK_WAVE_SHADER`)
 * mirrors {@link silkPoint} line for line; the tests hold the two together
 * through the math, and the analytic normals against finite differences.
 *
 * Silk frame: +X out from the pole to the fly, +Y up the pole, +Z the face
 * (X × Y). The origin is the top of the hoist edge, so the silk spans
 * x in [0, fly], y in [−header, 0]. Pure: no three.js.
 *
 * A silk's shape (`../sizes/silkShapes`) shapes the grid before the wave:
 * each column of the grid runs from the outline's top to its bottom at that
 * point of the fly (the depth field). Where a column crosses the outline
 * more than twice (a hollow, a hook, a notch) the grid spans the outline's
 * envelope and the silk shader cuts the rest away with the shape's mask
 * (`silkMask.ts`), so the 3D silk ends where the Artwork template's shape
 * mask does. A silk with no shape is the header × fly rectangle.
 */
import {
    cutPathBounds,
    cutPathHeader,
    sampleCutPath,
    silkCutShape,
    type CutPath,
} from "../sizes/silkCuts";
import { SILK_SHAPE_IDS, silkShape } from "../sizes/silkShapes";
import type { Detail } from "./model";

/** The global silk defaults, not editable (props-spec.md section 7, ticket 10). */
export const SILK_WAVE = {
    /** The wave's height, m. */
    amplitude: 0.055,
    /** Its length along the fly, m. */
    wavelength: 0.9,
    /** How fast it travels toward the fly at rest, m/s. */
    waveSpeed: 0.2,
    /** Per m/s of ground speed: faster travel and a taller wave. */
    speedCoupling: 0.25,
    /** Per rad/s of turn: how far the fly swings out against a turn. */
    turnCoupling: 0.05,
    /** How far the fly sags off the pole at rest (radians at the fly, over 1.1). */
    droop: 0.5,
} as const;

/** Ground speed at which a silk has fully lifted out of its droop, m/s. */
export const SILK_LIFT_SPEED = 1.2;

/** Cells out to the fly and along the pole, per detail (ticket 18). */
export const SILK_GRID: Record<Detail, { fly: number; header: number }> = {
    high: { fly: 24, header: 16 },
    low: { fly: 12, header: 8 },
};

/** Points along the fly where a Cut's depth field is sampled, less one. */
export const SILK_CUT_SAMPLES = 16;

/**
 * The shader's index of a silk's shape: 0 for none (the rectangle), else 1
 * plus its index in `SILK_SHAPE_IDS`.
 */
export function silkCutIndex(shape: string | undefined): number {
    return shape ? SILK_SHAPE_IDS.indexOf(shape as never) + 1 : 0;
}

/**
 * A Cut's depth field: at each of `SILK_CUT_SAMPLES + 1` even steps from
 * the pole (0) to the fly (1), how far down the outline's top and bottom
 * are, as fractions of the header.
 */
export interface SilkCutProfile {
    top: readonly number[];
    bottom: readonly number[];
    /** The outline's lowest point, in headers: 1 unless it hangs below the pole. */
    depth: number;
}

/** A Cut's depth field, from a catalog id with a traced shape or a path. */
export function silkCutProfile(cut: string | CutPath): SilkCutProfile {
    const path = typeof cut === "string" ? silkCutShape(cut)?.path : cut;
    if (!path) throw new Error(`${String(cut)}: no traced silk Cut`);
    const fly = cutPathBounds(path).maxX;
    const header = cutPathHeader(path);
    // the outline, closed by the pole edge back up to (0, 0)
    const poly = [...sampleCutPath(path), [0, 0] as const];
    const top: number[] = [];
    const bottom: number[] = [];
    // the flattened outline can fall a hair short of a curve's true fly
    const reach = Math.max(...poly.map((p) => p[0]));
    for (let i = 0; i <= SILK_CUT_SAMPLES; i++) {
        const x = Math.min((i / SILK_CUT_SAMPLES) * fly, reach);
        let lo = Infinity;
        let hi = -Infinity;
        for (let k = 1; k < poly.length; k++) {
            const [ax, ay] = poly[k - 1];
            const [bx, by] = poly[k];
            if (x < Math.min(ax, bx) - 1e-9 || x > Math.max(ax, bx) + 1e-9)
                continue;
            const ys =
                Math.abs(bx - ax) < 1e-12
                    ? [ay, by]
                    : [ay + ((x - ax) / (bx - ax)) * (by - ay)];
            for (const y of ys) {
                lo = Math.min(lo, y);
                hi = Math.max(hi, y);
            }
        }
        top.push(lo / header);
        bottom.push(hi / header);
    }
    return { top, bottom, depth: cutPathBounds(path).maxY / header };
}

const RECTANGLE: SilkCutProfile = {
    top: new Array<number>(SILK_CUT_SAMPLES + 1).fill(0),
    bottom: new Array<number>(SILK_CUT_SAMPLES + 1).fill(1),
    depth: 1,
};

/** Every shape's depth field, in the shader's order: the rectangle first. */
export function silkCutProfiles(): SilkCutProfile[] {
    return [
        RECTANGLE,
        ...SILK_SHAPE_IDS.map((id) => silkCutProfile(silkShape(id).path)),
    ];
}

/**
 * Where (u, v) of the grid lies on the flat silk, as an Artwork template
 * and the shape's mask read it: x from the pole (0) to the fly (1), y from
 * the top of the pole edge (0) down to the outline's lowest point (1).
 */
export function silkPlanar(
    u: number,
    v: number,
    cut: SilkCutProfile = RECTANGLE,
): [x: number, y: number] {
    const f = Math.min(Math.max(u, 0), 1) * SILK_CUT_SAMPLES;
    const i = Math.min(Math.floor(f), SILK_CUT_SAMPLES - 1);
    const w = f - i;
    const top = cut.top[i] + w * (cut.top[i + 1] - cut.top[i]);
    const bot = cut.bottom[i] + w * (cut.bottom[i + 1] - cut.bottom[i]);
    return [u, (top + (1 - v) * (bot - top)) / cut.depth];
}

/**
 * The shortest column the normal is taken over, as a fraction of the
 * header: where a Cut's top meets its bottom (the swing's fly tip) the
 * column has no height and no normal of its own.
 */
const MIN_NORMAL_DEPTH = 0.02;

/** One silk's inputs at a moment: its size, which face is out, and its motion. */
export interface SilkWaveInput {
    /** Out from the pole to the fly edge, m. */
    fly: number;
    /** Along the pole, m. */
    header: number;
    /** +1, or −1 for a mirror image: the wave's face offset flips. */
    mirror: number;
    /** The traveling wave's phase, radians (`silkPhases`). */
    wavePhase: number;
    /** The belly's slow breathing phase, radians (`silkPhases`). */
    bellyPhase: number;
    /** Ground speed, m/s. */
    speed: number;
    /** Turn rate, rad/s (counterclockwise seen from above). */
    turn: number;
    /** The silk's Cut; none is the header × fly rectangle. */
    cut?: SilkCutProfile;
}

const TAU = Math.PI * 2;
const wrap = (a: number) => a - TAU * Math.floor(a / TAU);

/**
 * The per-instance phases at a moment, wrapped to [0, 2π) in double
 * precision so the shader's floats stay small however long the show runs.
 *
 * The prototype's wave travels at `waveSpeed × (1 + speedCoupling × speed)`
 * for the whole clock, so a change of speed late in a show jumped the phase
 * by speed × time. Here the speed's share of the travel follows the
 * distance the performer has covered (`distance`), which is the same for a
 * steady speed and continuous when the speed changes.
 */
export function silkPhases(
    /** The show clock, s. */
    seconds: number,
    /** Ground distance covered since the show's start, m. */
    distance: number,
    /** The silk's phase seed, radians. */
    seed: number,
): { wavePhase: number; bellyPhase: number } {
    const k = TAU / SILK_WAVE.wavelength;
    const travel =
        SILK_WAVE.waveSpeed * (seconds + SILK_WAVE.speedCoupling * distance);
    return {
        wavePhase: wrap(k * travel - seed),
        bellyPhase: wrap(1.3 * seconds + seed),
    };
}

/** A phase seed per silk, spread by the golden angle so neighbors differ. */
export function silkSeed(index: number): number {
    return wrap(index * 2.399963);
}

/**
 * The silk's point at (u, v), u from the pole (0) to the fly (1) and v
 * from the bottom (0) to the top (1), in the silk frame, and its unit
 * normal, analytic: ∂P/∂u × ∂P/∂v, the side the grid's winding faces.
 */
export function silkPoint(
    u: number,
    v: number,
    s: SilkWaveInput,
    pos: number[] | Float32Array = [0, 0, 0],
    normal: number[] | Float32Array = [0, 0, 0],
): void {
    const {
        amplitude: A,
        wavelength,
        speedCoupling,
        turnCoupling,
        droop,
    } = SILK_WAVE;
    const W = s.fly;
    const H = s.header;
    // the Cut's top and bottom at u, and their slopes along u
    const cut = s.cut ?? RECTANGLE;
    const f = Math.min(Math.max(u, 0), 1) * SILK_CUT_SAMPLES;
    const i = Math.min(Math.floor(f), SILK_CUT_SAMPLES - 1);
    const w = f - i;
    const top = cut.top[i] + w * (cut.top[i + 1] - cut.top[i]);
    const bot = cut.bottom[i] + w * (cut.bottom[i + 1] - cut.bottom[i]);
    const dTop = (cut.top[i + 1] - cut.top[i]) * SILK_CUT_SAMPLES;
    const dBot = (cut.bottom[i + 1] - cut.bottom[i]) * SILK_CUT_SAMPLES;
    // how far down the hoist edge (u, v) is, in headers, and its slope in u
    const depth = top + (1 - v) * (bot - top);
    const dDepth = dTop + (1 - v) * (dBot - dTop);
    const k = TAU / wavelength;
    const sp = s.speed;
    const ampDrive = Math.min(1 + speedCoupling * sp, 3);
    const lift = Math.min(Math.max(sp / SILK_LIFT_SPEED, 0), 1);
    // at rest the fly sags off the pole, turning about the face by c·u
    const c = 1.1 * droop * (1 - lift);
    const cs = Math.cos(c * u);
    const sn = Math.sin(c * u);
    const x1 = u * W * cs;
    const y1 = -depth * H - u * W * sn;
    const dx1 = W * cs - u * W * c * sn;
    const dy1 = -dDepth * H - (W * sn + u * W * c * cs);
    // still at the pole, the wave grows over the first third of the fly
    const ue = Math.min(1, 3 * u);
    const env = Math.sin((Math.PI / 2) * ue);
    const envSlope =
        u < 1 / 3 ? ((3 * Math.PI) / 2) * Math.cos((Math.PI / 2) * ue) : 0;
    // a belly that fills with speed and breathes slowly
    const bb = 0.85 + 0.15 * Math.sin(s.bellyPhase);
    const bellyK = 1.8 * lift * ampDrive * bb;
    const su = Math.sin(Math.PI * u);
    const cu = Math.cos(Math.PI * u);
    const sv = Math.sin(Math.PI * v);
    const cv = Math.cos(Math.PI * v);
    // a wave traveling out to the fly
    const waveK = 0.5 * (0.3 + 0.7 * lift);
    const th = k * u * W + 1.5 * v - s.wavePhase;
    const st = Math.sin(th);
    const ct = Math.cos(th);
    const z = A * (bellyK * su * sv + waveK * env * st);
    const dzu =
        A *
        (bellyK * Math.PI * cu * sv +
            waveK * (envSlope * st + env * ct * k * W));
    const dzv = A * (bellyK * Math.PI * su * cv + waveK * env * ct * 1.5);
    // a turn swings the fly out against it
    const b = -turnCoupling * s.turn;
    const cb = Math.cos(b * u);
    const sb = Math.sin(b * u);
    const m = s.mirror < 0 ? -1 : 1;
    pos[0] = x1 * cb;
    pos[1] = y1;
    pos[2] = m * (z + x1 * sb);
    // ∂P/∂u and ∂P/∂v, before the mirror
    const ux = dx1 * cb - x1 * sb * b;
    const uy = dy1;
    const uz = dzu + dx1 * sb + x1 * cb * b;
    const vx = 0;
    const vy = Math.max(bot - top, MIN_NORMAL_DEPTH) * H;
    const vz = dzv;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    // mirrored: (Du × Dv) for D = diag(1, 1, −1) is (−nx, −ny, nz)
    nx *= m;
    ny *= m;
    const l = Math.hypot(nx, ny, nz) || 1;
    normal[0] = nx / l;
    normal[1] = ny / l;
    normal[2] = nz / l;
}

/**
 * Every shape's depth field as GLSL `vec2(top, bottom)`s and its depth in
 * headers, the rectangle first.
 */
function cutTable(): string {
    const cuts = silkCutProfiles();
    const n = cuts.length * (SILK_CUT_SAMPLES + 1);
    const values = cuts.flatMap((c) =>
        c.top.map((t, i) => `vec2(${t.toFixed(6)}, ${c.bottom[i].toFixed(6)})`),
    );
    const depths = cuts.map((c) => c.depth.toFixed(6));
    return `const vec2 SILK_CUTS[${n}] = vec2[${n}](${values.join(", ")});
const float SILK_CUT_DEPTH[${cuts.length}] = float[${cuts.length}](${depths.join(", ")});`;
}

/**
 * The shader's copy of {@link silkPoint}: `silkPoint(u, v, size, motion,
 * cut, pos, normal)` with `size` (fly, header, mirror), `motion` (wave
 * phase, belly phase, speed, turn) and `cut` the shape's index
 * ({@link silkCutIndex}); and `silkPlanar(u, v, cut)`, the copy of
 * {@link silkPlanar}.
 */
export const SILK_WAVE_SHADER = /* glsl */ `
${cutTable()}
vec2 silkPlanar(float u, float v, float cut) {
  const int SAMPLES = ${SILK_CUT_SAMPLES};
  float f = clamp(u, 0.0, 1.0) * float(SAMPLES);
  int i = min(int(floor(f)), SAMPLES - 1);
  int c = int(cut + 0.5);
  int base = c * (SAMPLES + 1);
  vec2 tb = mix(SILK_CUTS[base + i], SILK_CUTS[base + i + 1], f - float(i));
  return vec2(u, (tb.x + (1.0 - v) * (tb.y - tb.x)) / SILK_CUT_DEPTH[c]);
}
void silkPoint(float u, float v, vec3 size, vec4 motion, float cut, out vec3 pos, out vec3 nrm) {
  const float A = ${SILK_WAVE.amplitude.toFixed(6)};
  const float K = ${(TAU / SILK_WAVE.wavelength).toFixed(8)};
  const float SPEED_K = ${SILK_WAVE.speedCoupling.toFixed(6)};
  const float TURN_K = ${SILK_WAVE.turnCoupling.toFixed(6)};
  const float DROOP = ${SILK_WAVE.droop.toFixed(6)};
  const float LIFT = ${SILK_LIFT_SPEED.toFixed(6)};
  const float PI_ = 3.14159265;
  const int SAMPLES = ${SILK_CUT_SAMPLES};
  const float MIN_DEPTH = ${MIN_NORMAL_DEPTH.toFixed(6)};
  float W = size.x, H = size.y;
  float f = clamp(u, 0.0, 1.0) * float(SAMPLES);
  int i = min(int(floor(f)), SAMPLES - 1);
  int base = int(cut + 0.5) * (SAMPLES + 1);
  vec2 cut0 = SILK_CUTS[base + i], cut1 = SILK_CUTS[base + i + 1];
  vec2 tb = mix(cut0, cut1, f - float(i));
  vec2 dtb = (cut1 - cut0) * float(SAMPLES);
  float depth = tb.x + (1.0 - v) * (tb.y - tb.x);
  float dDepth = dtb.x + (1.0 - v) * (dtb.y - dtb.x);
  float sp = motion.z;
  float ampDrive = min(1.0 + SPEED_K * sp, 3.0);
  float lift = clamp(sp / LIFT, 0.0, 1.0);
  float c = 1.1 * DROOP * (1.0 - lift);
  float cs = cos(c * u), sn = sin(c * u);
  float x1 = u * W * cs;
  float y1 = -depth * H - u * W * sn;
  float dx1 = W * cs - u * W * c * sn;
  float dy1 = -dDepth * H - (W * sn + u * W * c * cs);
  float ue = min(1.0, 3.0 * u);
  float env = sin(0.5 * PI_ * ue);
  float envSlope = u < 1.0 / 3.0 ? 1.5 * PI_ * cos(0.5 * PI_ * ue) : 0.0;
  float bb = 0.85 + 0.15 * sin(motion.y);
  float bellyK = 1.8 * lift * ampDrive * bb;
  float su = sin(PI_ * u), cu = cos(PI_ * u), sv = sin(PI_ * v), cv = cos(PI_ * v);
  float waveK = 0.5 * (0.3 + 0.7 * lift);
  float th = K * u * W + 1.5 * v - motion.x;
  float st = sin(th), ct = cos(th);
  float z = A * (bellyK * su * sv + waveK * env * st);
  float dzu = A * (bellyK * PI_ * cu * sv + waveK * (envSlope * st + env * ct * K * W));
  float dzv = A * (bellyK * PI_ * su * cv + waveK * env * ct * 1.5);
  float b = -TURN_K * motion.w;
  float cb = cos(b * u), sb = sin(b * u);
  float m = size.z < 0.0 ? -1.0 : 1.0;
  pos = vec3(x1 * cb, y1, m * (z + x1 * sb));
  vec3 du = vec3(dx1 * cb - x1 * sb * b, dy1, dzu + dx1 * sb + x1 * cb * b);
  vec3 dv = vec3(0.0, max(tb.y - tb.x, MIN_DEPTH) * H, dzv);
  vec3 n = cross(du, dv);
  nrm = normalize(vec3(m * n.x, m * n.y, n.z));
}
`;
