// cspell:ignore metalness
import {
    DoubleSide,
    FrontSide,
    Group,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Vector3,
    type BufferGeometry,
    type Vector3Tuple,
} from "three";
import {
    createRng,
    ft,
    setFlushBacking,
    type SharedMaterials,
} from "../../environment";
import type { SeatRow } from "../../types";
import type { Stand, StandPlacement, StandSpec } from "../stands";
import { BoxBatch, QuadBuilder } from "./geometry";
import { buildPressBox, type PressBox } from "./pressBox";
import {
    STAND_BANDS,
    STAND_TILE,
    standTexture,
    type StandKind,
} from "./textures";

/**
 * The stands of the high school kits. `aluminum` is an open bleacher on a
 * galvanized frame (`hs`); `concrete` is a closed precast stand with a rear
 * concourse wall (`bighs`). Surface, benches and aisles are one mesh per stand;
 * rails and frames go into a batch shared by the kit, so a stand adds one draw
 * call of its own.
 */

/** People per aisle block and aisle width in people (see `buildCrowd`). */
const AISLE_BLOCK = 18;
const AISLE_GAP = 2;
const PERSON_STEP = 0.64;
const BENCH_LIFT = ft(1.35);
const BENCH_THICK = ft(0.2);
const BENCH_DEPTH = ft(0.95);
const FRAME_EVERY = ft(12);
const SEGMENT = 12;

/** Aisle center positions along a stand of `length`, in its local x. */
export function aisleCenters(length: number): number[] {
    const out: number[] = [];
    for (let k = 0; ; k++) {
        const x =
            -length / 2 +
            PERSON_STEP *
                (AISLE_BLOCK +
                    (AISLE_GAP - 1) / 2 +
                    k * (AISLE_BLOCK + AISLE_GAP));
        if (x > length / 2 - 2) break;
        out.push(x);
    }
    return out;
}

type Rgb = [number, number, number];

function standSurface(
    spec: StandSpec,
    kind: StandKind,
    high: boolean,
): BufferGeometry {
    const { length: L, rows, depth: d, rise, base } = spec;
    const q = new QuadBuilder();
    const rnd = createRng(rows * 17 + Math.round(L));
    const h = (i: number) => base + i * rise;
    const u = (x: number) => x / STAND_TILE;
    const { tread, riser, bench, aisle, side } = STAND_BANDS;
    const up = new Vector3(0, 1, 0);
    const front = new Vector3(0, 0, -1);
    const segments = high ? Math.max(1, Math.ceil(L / SEGMENT)) : 1;
    const seg = L / segments;
    /** Panels are replaced one at a time, so each one weathers differently. */
    const tone = (): Rgb => {
        const v = 0.93 + rnd() * 0.12;
        return [v, v * (0.99 + rnd() * 0.01), v * (0.97 + rnd() * 0.03)];
    };
    const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);

    for (let i = 0; i < rows; i++) {
        const z0 = i * d;
        const z1 = (i + 1) * d;
        const y = h(i);
        const yb = i === 0 ? 0 : h(i - 1);
        const zb = z0 + d * 0.32 - BENCH_DEPTH / 2;
        const zf = zb + BENCH_DEPTH;
        const ys = y + BENCH_LIFT;
        for (let s = 0; s < segments; s++) {
            const x0 = -L / 2 + s * seg;
            const x1 = x0 + seg;
            const c = tone();
            q.quad(
                v3(x0, y, z0),
                v3(x1, y, z0),
                v3(x1, y, z1),
                v3(x0, y, z1),
                [u(x0), tread[0]],
                [u(x1), tread[0]],
                [u(x1), tread[1]],
                [u(x0), tread[1]],
                c,
                up,
            );
            // Seat plank: its top and its nose.
            const ct = tone();
            q.quad(
                v3(x0, ys, zb),
                v3(x1, ys, zb),
                v3(x1, ys, zf),
                v3(x0, ys, zf),
                [u(x0), bench[0]],
                [u(x1), bench[0]],
                [u(x1), bench[1]],
                [u(x0), bench[1]],
                ct,
                up,
            );
        }

        const row = tone();
        q.quad(
            v3(-L / 2, yb, z0),
            v3(L / 2, yb, z0),
            v3(L / 2, y, z0),
            v3(-L / 2, y, z0),
            [u(-L / 2), riser[0]],
            [u(L / 2), riser[0]],
            [u(L / 2), riser[1]],
            [u(-L / 2), riser[1]],
            row,
            front,
        );
        q.quad(
            v3(-L / 2, ys - BENCH_THICK, zb),
            v3(L / 2, ys - BENCH_THICK, zb),
            v3(L / 2, ys, zb),
            v3(-L / 2, ys, zb),
            [u(-L / 2), riser[0]],
            [u(L / 2), riser[0]],
            [u(L / 2), riser[1]],
            [u(-L / 2), riser[1]],
            row,
            front,
        );
    }

    // Painted aisle steps: the crowd leaves these free, so they read from afar.
    if (high) {
        const half = PERSON_STEP;
        for (const x of aisleCenters(L)) {
            for (let i = 0; i < rows; i++) {
                const z0 = i * d;
                const z1 = (i + 1) * d;
                const y = h(i) + 0.012;
                q.quad(
                    v3(x - half, y, z0),
                    v3(x + half, y, z0),
                    v3(x + half, y, z1),
                    v3(x - half, y, z1),
                    [0, aisle[0]],
                    [1, aisle[0]],
                    [1, aisle[1]],
                    [0, aisle[1]],
                    undefined,
                    up,
                );
            }
        }
    }

    // Stepped end plates (the low path keeps them only where they hold the
    // stand's silhouette: concrete has no frame to show).
    const top = h(rows - 1);
    const vy = (y: number) => side[0] + ((side[1] - side[0]) * y) / top;
    if (high || kind === "concrete") {
        for (const sx of [-1, 1]) {
            const x = (sx * L) / 2;
            const out = v3(sx, 0, 0);
            for (let i = 0; i < rows; i++) {
                const z0 = i * d;
                const z1 = (i + 1) * d;
                const y = h(i);
                const y0 = kind === "aluminum" ? y - ft(0.6) : 0;
                q.quad(
                    v3(x, y0, z0),
                    v3(x, y0, z1),
                    v3(x, y, z1),
                    v3(x, y, z0),
                    [u(z0), vy(y0)],
                    [u(z1), vy(y0)],
                    [u(z1), vy(y)],
                    [u(z0), vy(y)],
                    undefined,
                    out,
                );
            }
        }
    }

    if (kind === "concrete") {
        const back = rows * d;
        q.quad(
            v3(-L / 2, 0, back),
            v3(L / 2, 0, back),
            v3(L / 2, top, back),
            v3(-L / 2, top, back),
            [u(-L / 2), vy(0)],
            [u(L / 2), vy(0)],
            [u(L / 2), vy(top)],
            [u(-L / 2), vy(top)],
            undefined,
            v3(0, 0, 1),
        );
    }
    return q.build(true);
}

/** Rails on every stand and, for aluminum, the frames that hold it up. */
function standSteel(
    spec: StandSpec,
    kind: StandKind,
    high: boolean,
    s: BoxBatch,
): void {
    const { length: L, rows, depth: d, rise, base } = spec;
    const h = (i: number) => base + i * rise;
    const top = h(rows - 1);
    const back = rows * d;
    const rail = ft(3.5);
    const t = ft(0.17);
    s.beam(
        [-L / 2, top + rail, back - t],
        [L / 2, top + rail, back - t],
        ft(0.2),
    );
    if (high) {
        for (let x = -L / 2; x <= L / 2 + 1e-3; x += ft(8)) {
            s.add([x, top + rail / 2, back - t], [t, rail, t]);
        }
        s.beam(
            [-L / 2, top + rail * 0.5, back - t],
            [L / 2, top + rail * 0.5, back - t],
            t,
        );
        // End rails follow the slope.
        for (const sx of [-1, 1]) {
            const x = sx * (L / 2 - t);
            s.beam(
                [x, base + rail, d * 0.5],
                [x, top + rail, back - d * 0.5],
                ft(0.2),
            );
            s.beam(
                [x, base + rail * 0.5, d * 0.5],
                [x, top + rail * 0.5, back - d * 0.5],
                t,
            );
            for (let i = 0; i < rows; i += 4) {
                s.add([x, h(i) + rail / 2, i * d + d * 0.5], [t, rail, t]);
            }
        }
        // Handrails up the aisles, from the third row.
        const hand = ft(2.8);
        for (const x of aisleCenters(L)) {
            const i0 = Math.min(3, rows - 1);
            s.beam(
                [x, h(i0) + hand, i0 * d + d * 0.5],
                [x, top + hand, back - d * 0.5],
                ft(0.15),
            );
            for (let i = i0; i < rows; i += 4) {
                s.add(
                    [x, h(i) + hand / 2, i * d + d * 0.5],
                    [ft(0.15), hand, ft(0.15)],
                );
            }
        }
    }
    if (kind !== "aluminum") return;

    // Frames: on the low path, only enough to show what holds the stand up.
    const beam = ft(0.45);
    const postEvery = 4;
    const frames = high
        ? Math.max(2, Math.ceil(L / FRAME_EVERY) + 1)
        : Math.max(2, Math.ceil(L / ft(40)) + 1);
    const yb = top - beam;
    for (let k = 0; k < frames; k++) {
        const x = -L / 2 + 0.3 + ((L - 0.6) * k) / (frames - 1);
        s.add([x, yb / 2, back - 0.15], [ft(0.4), yb, ft(0.4)]);
        if (!high) continue;
        s.beam([x, base - beam, 0.15], [x, top - beam, back - 0.15], beam);
        for (let i = 0; i < rows; i += postEvery) {
            const y = h(i) - beam;
            s.add([x, y / 2, i * d + 0.15], [ft(0.35), y, ft(0.35)]);
        }
        if (k < frames - 1) {
            const x2 = -L / 2 + 0.3 + ((L - 0.6) * (k + 1)) / (frames - 1);
            const a: Vector3Tuple = [x, 0.4, back - 0.15];
            const b: Vector3Tuple = [x2, yb * 0.85, back - 0.15];
            if (k % 2 === 0) s.beam(a, b, ft(0.3));
            else s.beam([x, b[1], b[2]], [x2, a[1], a[2]], ft(0.3));
        }
    }
    if (high) {
        for (const y of [yb * 0.35, yb * 0.7]) {
            s.beam([-L / 2, y, back - 0.15], [L / 2, y, back - 0.15], ft(0.35));
        }
    }
}

export interface SchoolStand extends Stand {
    /** Press box window glow, 0 (day) to 1 (night). */
    setGlow(k: number): void;
}

export interface SchoolStandInput {
    spec: StandSpec;
    placement: StandPlacement;
    kind: StandKind;
    high: boolean;
    shared: SharedMaterials;
    /** Rails and frames, in the kit's frame. */
    steel: BoxBatch;
    /** Tinted boxes, in the kit's frame. */
    props: BoxBatch;
    /** Adds the front wall (stand frame -> texture). */
    addWall(placement: Matrix4, spec: StandSpec): void;
    homeColor: string;
    fasciaText: string;
}

/** Placement as a matrix: stand frame to kit frame. */
export function placementMatrix(p: StandPlacement): Matrix4 {
    return new Matrix4().makeRotationY(p.yaw).setPosition(p.x, 0, p.z);
}

/** Builds one stand of a high school kit. */
export function buildSchoolStand(input: SchoolStandInput): SchoolStand {
    const { spec, placement, kind, high } = input;
    const { length, rows, depth, rise, base } = spec;
    const group = new Group();
    group.name = `stand:${spec.side}`;
    group.position.set(placement.x, 0, placement.z);
    group.rotation.y = placement.yaw;
    group.updateMatrix();
    const owned: { dispose(): void }[] = [];
    const toKit = (p: Vector3Tuple): Vector3Tuple => {
        const v = new Vector3(...p).applyMatrix4(group.matrix);
        return [v.x, v.y, v.z];
    };

    const surfaceGeo = standSurface(spec, kind, high);
    const surfaceMap = standTexture(kind);
    const surfaceMat = new MeshStandardMaterial({
        map: surfaceMap,
        vertexColors: true,
        roughness: kind === "aluminum" ? 0.55 : 0.95,
        metalness: kind === "aluminum" ? 0.4 : 0,
        side: kind === "aluminum" ? DoubleSide : FrontSide,
    });
    // Behind the stand's front and rear walls, a few centimeters in front.
    setFlushBacking(surfaceMat);
    owned.push(surfaceGeo, surfaceMap, surfaceMat);
    const treads = new Mesh(surfaceGeo, surfaceMat);
    treads.name = "treads";
    treads.castShadow = treads.receiveShadow = true;
    group.add(treads);

    const seatRows: SeatRow[] = [];
    for (let i = 0; i < rows; i++) {
        // People sit on the bench, not on the tread below it.
        const h = base + i * rise + BENCH_LIFT;
        const z = i * depth + depth * 0.42;
        seatRows.push({
            points: [toKit([-length / 2, h, z]), toKit([length / 2, h, z])],
            closed: false,
            depth,
            side: spec.side,
        });
    }

    const at = placementMatrix(placement);
    input.addWall(at, spec);

    const steel = new BoxBatch();
    standSteel(spec, kind, high, steel);
    const props = new BoxBatch();

    let pressEye: Vector3Tuple | undefined;
    let press: PressBox | undefined;
    if (spec.pressBox) {
        const pb = spec.pressBox;
        press = buildPressBox({
            width: pb.width,
            height: pb.height,
            lift: pb.lift,
            stories: pb.stories ?? 1,
            top: base + (rows - 1) * rise,
            back: rows * depth,
            homeColor: input.homeColor,
            text: input.fasciaText,
            high,
            steel,
            props,
        });
        group.add(press.group);
        pressEye = toKit(press.eye);
    }
    input.steel.append(steel.transform(at));
    input.props.append(props.transform(at));

    return {
        group,
        seatRows,
        pickTarget: treads,
        pressEye,
        rowEye: (i) =>
            toKit([0, base + i * rise + ft(4), i * depth + depth * 0.45]),
        setGlow(k) {
            press?.setGlow(k);
        },
        dispose() {
            press?.dispose();
            owned.forEach((o) => o.dispose());
        },
    };
}
