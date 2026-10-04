// cspell:ignore metalness
import {
    BufferGeometry,
    Float32BufferAttribute,
    Group,
    InstancedMesh,
    LineBasicMaterial,
    LineSegments,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    Quaternion,
    Shape,
    ShapeGeometry,
    Vector2,
    Vector3,
    type Object3D,
    type Vector3Tuple,
} from "three";
import {
    createSharedMaterials,
    ft,
    lightingValues,
    lightPole,
    videoBoard,
    type LightPole,
    type SharedMaterials,
    type VideoBoard,
} from "../environment";
import type {
    CameraSeat,
    FieldFootprint,
    KitBuildInput,
    KitResult,
    LightingPreset,
    SeatRow,
    VenueKitId,
} from "../types";

/**
 * Rectangular stands and the shared builder behind the `hs`, `bighs`, `college`
 * and `blank` kits (P2.3). Ported from the reference demo's `stand`,
 * `buildStadium`, `addTrack` and `stadiumPath`, in meters, with everything
 * placed relative to the field footprint (design.md section 6).
 *
 * The field surface itself is P2.1's job. These kits only leave the footprint
 * area free, with a grass apron around it.
 */

/** The footprint with its center and half sizes, in world meters. */
export interface Frame extends FieldFootprint {
    cx: number;
    cz: number;
    halfW: number;
    halfD: number;
}

export function frameOf(fp: FieldFootprint): Frame {
    return {
        ...fp,
        cx: (fp.minX + fp.maxX) / 2,
        cz: (fp.minZ + fp.maxZ) / 2,
        halfW: (fp.maxX - fp.minX) / 2,
        halfD: (fp.maxZ - fp.minZ) / 2,
    };
}

export interface PressBoxSpec {
    width: number;
    height: number;
    /** Lift above the top row, on a concrete column. */
    lift: number;
    /** Glass bands, default 1. */
    stories?: number;
}

/** A stand in its own frame: front edge at z = 0, rising toward +z. */
export interface StandSpec {
    length: number;
    rows: number;
    /** Tread depth. */
    depth: number;
    rise: number;
    /** Height of the first row's tread. */
    base: number;
    side: SeatRow["side"];
    pressBox?: PressBoxSpec;
}

/** Where a stand's local origin goes: world x and z, and its yaw about +Y. */
export interface StandPlacement {
    x: number;
    z: number;
    yaw: number;
}

export interface Stand {
    group: Group;
    /** One polyline per row, in the kit root's frame (placement applied). */
    seatRows: SeatRow[];
    /** The instanced tread boxes: what pick-a-seat raycasts against. */
    pickTarget: InstancedMesh;
    /** Eye position in front of the press box glass, kit frame. */
    pressEye?: Vector3Tuple;
    /** Eye position above row `i`, kit frame. */
    rowEye(i: number): Vector3Tuple;
    dispose(): void;
}

const BENCH_LIFT = ft(1.35);
const BENCH_THICK = ft(0.25);
const BENCH_DEPTH = ft(0.9);
const PRESS_BODY_DEPTH = ft(14);

/** Builds one rectangular stand, positioned by `placement`. */
export function buildStand(
    spec: StandSpec,
    placement: StandPlacement,
    shared: SharedMaterials,
): Stand {
    const { length, rows, depth, rise, base } = spec;
    const group = new Group();
    group.name = `stand:${spec.side}`;
    group.position.set(placement.x, 0, placement.z);
    group.rotation.y = placement.yaw;
    group.updateMatrix();

    const treads = new InstancedMesh(shared.unitBox, shared.concrete, rows);
    const bench = new InstancedMesh(shared.unitBox, shared.bench, rows);
    treads.name = "treads";
    bench.name = "bench";
    const m = new Matrix4();
    const q = new Quaternion();
    const seatRows: SeatRow[] = [];
    const toKit = (p: Vector3Tuple): Vector3Tuple => {
        const v = new Vector3(...p).applyMatrix4(group.matrix);
        return [v.x, v.y, v.z];
    };
    for (let i = 0; i < rows; i++) {
        const h = base + i * rise;
        m.compose(
            new Vector3(0, h / 2, i * depth + depth / 2),
            q,
            new Vector3(length, h, depth),
        );
        treads.setMatrixAt(i, m);
        m.compose(
            new Vector3(0, h + BENCH_LIFT, i * depth + depth * 0.32),
            q,
            new Vector3(length, BENCH_THICK, BENCH_DEPTH),
        );
        bench.setMatrixAt(i, m);
        const z = i * depth + depth * 0.42;
        seatRows.push({
            points: [toKit([-length / 2, h, z]), toKit([length / 2, h, z])],
            closed: false,
            depth,
            side: spec.side,
        });
    }
    treads.castShadow = treads.receiveShadow = true;
    bench.receiveShadow = true;
    group.add(treads, bench);

    let pressEye: Vector3Tuple | undefined;
    if (spec.pressBox) {
        const pb = spec.pressBox;
        const top = base + (rows - 1) * rise;
        const zb = rows * depth;
        const stories = pb.stories ?? 1;
        const storyH = pb.height / stories;
        const y0 = top + pb.lift;
        const box = new Group();
        box.name = "pressBox";
        const body = new Mesh(shared.unitBox, shared.std(0xe6e3dc));
        body.scale.set(pb.width, pb.height, PRESS_BODY_DEPTH);
        body.position.set(0, y0 + pb.height / 2, zb + PRESS_BODY_DEPTH / 2);
        const roof = new Mesh(shared.unitBox, shared.std(0x55585f));
        roof.scale.set(pb.width + ft(4), ft(1.2), ft(18));
        roof.position.set(0, y0 + pb.height + ft(0.6), zb + ft(6));
        for (const part of [body, roof]) {
            part.castShadow = part.receiveShadow = true;
        }
        const glassMat = shared.std(0x1d2a3d, {
            roughness: 0.15,
            metalness: 0.4,
            emissive: 0x0b1320,
        });
        for (let k = 0; k < stories; k++) {
            const glass = new Mesh(shared.unitBox, glassMat);
            glass.scale.set(pb.width - ft(3), storyH * 0.45, ft(0.4));
            glass.position.set(0, y0 + storyH * (k + 0.58), zb - ft(0.1));
            box.add(glass);
        }
        if (pb.lift > 0) {
            const column = new Mesh(shared.unitBox, shared.concrete);
            column.scale.set(pb.width * 0.9, pb.lift + ft(0.5), ft(12));
            column.position.set(0, top + pb.lift / 2, zb + ft(7));
            column.castShadow = true;
            box.add(column);
        }
        box.add(body, roof);
        group.add(box);
        pressEye = toKit([0, y0 + storyH * (stories - 1 + 0.55), zb - ft(2)]);
    }

    return {
        group,
        seatRows,
        pickTarget: treads,
        pressEye,
        rowEye: (i) =>
            toKit([0, base + i * rise + ft(4), i * depth + depth * 0.45]),
        dispose() {
            treads.dispose();
            bench.dispose();
        },
    };
}

/** Stadium outline (straights plus semicircle ends) as world x, z points. */
export function stadiumPoints(
    cx: number,
    cz: number,
    straightHalf: number,
    r: number,
    segments = 48,
): Vector2[] {
    const pts: Vector2[] = [
        new Vector2(cx - straightHalf, cz - r),
        new Vector2(cx + straightHalf, cz - r),
    ];
    for (let i = 1; i < segments; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / segments;
        pts.push(
            new Vector2(
                cx + straightHalf + r * Math.cos(a),
                cz + r * Math.sin(a),
            ),
        );
    }
    pts.push(
        new Vector2(cx + straightHalf, cz + r),
        new Vector2(cx - straightHalf, cz + r),
    );
    for (let i = 1; i < segments; i++) {
        const a = Math.PI / 2 + (Math.PI * i) / segments;
        pts.push(
            new Vector2(
                cx - straightHalf + r * Math.cos(a),
                cz + r * Math.sin(a),
            ),
        );
    }
    return pts;
}

export interface TrackResult {
    objects: Object3D[];
    dispose(): void;
}

const TRACK_INNER_GAP = ft(15);
const TRACK_WIDTH = ft(30);
/** Height of the apron, track and lane lines above y = 0. */
const APRON_Y = 0.005;
const TRACK_Y = 0.015;
const LANE_Y = 0.02;

/** A 6-lane track around the field: 29 to 38.1 m radius on a football field. */
export function buildTrack(frame: Frame, shared: SharedMaterials): TrackResult {
    const straight = Math.max(frame.halfW - ft(30), ft(30));
    const inner = frame.halfD + TRACK_INNER_GAP;
    const outer = inner + TRACK_WIDTH;
    // Shape space is (x, -z); a rotation of -90 degrees about X maps it to the ground.
    const flip = (pts: Vector2[]) => pts.map((p) => new Vector2(p.x, -p.y));
    const shape = new Shape(
        flip(stadiumPoints(frame.cx, frame.cz, straight, outer)),
    );
    const hole = flip(stadiumPoints(frame.cx, frame.cz, straight, inner));
    shape.holes.push(new Shape(hole.reverse()));
    const geometry = new ShapeGeometry(shape);
    const track = new Mesh(geometry, shared.std(0xa24a36, { roughness: 0.95 }));
    track.name = "track";
    track.rotation.x = -Math.PI / 2;
    track.position.y = TRACK_Y;
    track.receiveShadow = true;

    const lanes: number[] = [];
    for (let r = inner; r <= outer + 1e-6; r += ft(5)) {
        const pts = stadiumPoints(frame.cx, frame.cz, straight, r);
        pts.forEach((p, i) => {
            const n = pts[(i + 1) % pts.length];
            lanes.push(p.x, LANE_Y, p.y, n.x, LANE_Y, n.y);
        });
    }
    const laneGeo = new BufferGeometry();
    laneGeo.setAttribute("position", new Float32BufferAttribute(lanes, 3));
    const laneMat = new LineBasicMaterial({
        color: 0xf2f2f2,
        transparent: true,
        opacity: 0.8,
    });
    const laneLines = new LineSegments(laneGeo, laneMat);
    laneLines.name = "trackLanes";
    return {
        objects: [track, laneLines],
        dispose() {
            geometry.dispose();
            laneGeo.dispose();
            laneMat.dispose();
        },
    };
}

/** A flat ground plane, centered at (x, y, z). */
export function groundPlane(
    width: number,
    depth: number,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    name: string,
): { mesh: Mesh; geometry: PlaneGeometry } {
    const geometry = new PlaneGeometry(width, depth);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.userData.ground = true;
    return { mesh, geometry };
}

/** The big plane under everything (the demo's 9000 ft). */
export const GROUND_SIZE = ft(9000);
export const GROUND_Y = -ft(0.3);
export const APRON_HEIGHT = APRON_Y;

/** Blimp offset from the field center: back-left and high, toward the audience. */
export const BLIMP_OFFSET: Vector3Tuple = [-ft(380), ft(420), ft(410)];
/** The top-down camera sits this far toward the audience so "up" is the back. */
export const TOP_DOWN_NUDGE = 0.15;

export function cameraSeat(
    id: string,
    kind: CameraSeat["kind"],
    position: Vector3Tuple,
    target: Vector3Tuple,
): CameraSeat {
    return {
        id,
        labelKey: `view3d.camera.${id}`,
        kind,
        position,
        target,
    };
}

export function blimpCamera(frame: Frame): CameraSeat {
    return cameraSeat(
        "blimp",
        "aerial",
        [
            frame.cx + BLIMP_OFFSET[0],
            BLIMP_OFFSET[1],
            frame.cz + BLIMP_OFFSET[2],
        ],
        [frame.cx, 0, frame.cz],
    );
}

export function topDownCamera(frame: Frame, height: number): CameraSeat {
    return cameraSeat(
        "topDown",
        "topDown",
        [frame.cx, height, frame.cz + TOP_DOWN_NUDGE],
        [frame.cx, 0, frame.cz],
    );
}

export const OUTDOOR_PRESETS: LightingPreset[] = ["day", "dusk", "night"];

export interface PoleSpot {
    /** -1 for the side-1 end, 1 for side 2. */
    sx: -1 | 1;
    /** Meters past the field's end edge. */
    dx: number;
    /** True: in front of the front sideline; false: behind the back one. */
    front: boolean;
    /** Meters past that sideline. */
    dz: number;
}

export interface StandsKitConfig {
    id: Extract<VenueKitId, "hs" | "bighs" | "college">;
    groundColor: number;
    /** Extra lawn around the footprint (inside a paved surround). */
    infield?: { extraW: number; extraD: number };
    track: boolean;
    /** Gap from the sideline to the stand's front edge. */
    front: { spec: Omit<StandSpec, "side">; gap: number };
    back: { spec: Omit<StandSpec, "side">; gap: number };
    /** Stands behind each end line, `gap` meters from it. */
    ends?: { spec: Omit<StandSpec, "side">; gap: number };
    board?: {
        w: number;
        h: number;
        legs: number;
        /** Center of the board past the side-2 end edge. */
        dx: number;
        /** Height of the screen center. */
        y: number;
        title: string;
    };
    /** Paved plaza behind the side-1 end zone. */
    plaza?: { dx: number; w: number; d: number };
    podium: boolean;
    poles: { height: number; spots: PoleSpot[] };
    cameras: {
        /** The press box camera aims this far behind the field center. */
        pressTargetBack: number;
        /** End-zone camera: end, distance past the end edge and height. */
        endZone: { sx: -1 | 1; dx: number; y: number };
        topDownHeight: number;
    };
    crowdDensity: number;
    defaultLighting: LightingPreset;
}

const FRONT_ROW_OFFSET = -ft(36);
const PODIUM = { w: ft(6), h: ft(8), d: ft(6), z: ft(26) };

/**
 * Shared builder for the three rectangular-stand kits. Builds the ground, the
 * apron around the footprint, the stands, extras and poles, then returns the
 * `KitResult`. The scene builds the crowd from `seatRows` and `crowdDensity`.
 */
export function buildStandsKit(
    cfg: StandsKitConfig,
    input: KitBuildInput,
): KitResult {
    const f = frameOf(input.footprint);
    const shared = createSharedMaterials();
    const root = new Group();
    root.name = `kit:${cfg.id}`;
    const geometries: { dispose(): void }[] = [];
    const disposables: { dispose(): void }[] = [];

    const ground = groundPlane(
        GROUND_SIZE,
        GROUND_SIZE,
        shared.std(cfg.groundColor, { roughness: 1 }),
        f.cx,
        GROUND_Y,
        f.cz,
        "ground",
    );
    root.add(ground.mesh);
    geometries.push(ground.geometry);
    if (cfg.infield) {
        const lawn = groundPlane(
            f.halfW * 2 + cfg.infield.extraW,
            f.halfD * 2 + cfg.infield.extraD,
            shared.std(0x3d6e31, { roughness: 1 }),
            f.cx,
            GROUND_Y + ft(0.1),
            f.cz,
            "infield",
        );
        root.add(lawn.mesh);
        geometries.push(lawn.geometry);
    }
    const apron = groundPlane(
        f.halfW * 2 + ft(40),
        f.halfD * 2 + ft(40),
        shared.std(0x3a7330, { roughness: 1 }),
        f.cx,
        APRON_Y,
        f.cz,
        "apron",
    );
    root.add(apron.mesh);
    geometries.push(apron.geometry);

    if (cfg.track) {
        const track = buildTrack(f, shared);
        root.add(...track.objects);
        disposables.push(track);
    }

    const stands: Stand[] = [];
    const addStand = (
        spec: Omit<StandSpec, "side">,
        side: SeatRow["side"],
        placement: StandPlacement,
    ) => {
        const stand = buildStand({ ...spec, side }, placement, shared);
        root.add(stand.group);
        stands.push(stand);
        return stand;
    };
    const front = addStand(cfg.front.spec, "home", {
        x: f.cx,
        z: f.maxZ + cfg.front.gap,
        yaw: 0,
    });
    addStand(cfg.back.spec, "away", {
        x: f.cx,
        z: f.minZ - cfg.back.gap,
        yaw: Math.PI,
    });
    if (cfg.ends) {
        for (const sx of [-1, 1] as const) {
            addStand(cfg.ends.spec, "neutral", {
                x: f.cx + sx * (f.halfW + cfg.ends.gap),
                z: f.cz,
                yaw: sx * (Math.PI / 2),
            });
        }
    }

    if (cfg.plaza) {
        const plaza = groundPlane(
            cfg.plaza.w,
            cfg.plaza.d,
            shared.std(0x8a8c90, { roughness: 1 }),
            f.minX - cfg.plaza.dx,
            GROUND_Y + ft(0.2),
            f.cz,
            "plaza",
        );
        root.add(plaza.mesh);
        geometries.push(plaza.geometry);
    }

    const boards: VideoBoard[] = [];
    if (cfg.board) {
        const b = cfg.board;
        const board = videoBoard(
            b.w,
            b.h,
            b.legs,
            b.title,
            "OpenMarch",
            shared,
        );
        board.object.position.set(f.maxX + b.dx, b.y, f.cz);
        board.object.rotation.y = -Math.PI / 2;
        root.add(board.object);
        boards.push(board);
    }

    if (cfg.podium) {
        const podium = new Mesh(shared.unitBox, shared.std(0xe6e3dc));
        podium.name = "podium";
        podium.scale.set(PODIUM.w, PODIUM.h, PODIUM.d);
        podium.position.set(f.cx, PODIUM.h / 2, f.maxZ + PODIUM.z);
        podium.castShadow = true;
        root.add(podium);
    }

    const poles: LightPole[] = cfg.poles.spots.map((s) => {
        const x = f.cx + s.sx * (f.halfW + s.dx);
        const z = s.front ? f.maxZ + s.dz : f.minZ - s.dz;
        // Aim a quarter of the way in x and a sixth in z from the field center
        // toward the pole (the demo's target), relative to the pole's base.
        const pole = lightPole(
            cfg.poles.height,
            [(x - f.cx) * -0.75, 0, (z - f.cz) * -0.85],
            shared,
        );
        pole.object.position.set(x, 0, z);
        root.add(pole.object);
        return pole;
    });

    const seatRows = stands.flatMap((s) => s.seatRows);

    const focus: Vector3Tuple = [f.cx, 0, f.cz];
    const cams: CameraSeat[] = [
        cameraSeat(
            "pressBox",
            "seat",
            front.pressEye ??
                front.rowEye(Math.max(0, cfg.front.spec.rows - 1)),
            [f.cx, 0, f.cz - cfg.cameras.pressTargetBack],
        ),
    ];
    const row1 = front.rowEye(1);
    cams.push(
        cameraSeat(
            "frontRow",
            "seat",
            [row1[0] + FRONT_ROW_OFFSET, row1[1], row1[2]],
            [f.cx - ft(12), ft(6), f.cz],
        ),
    );
    if (cfg.podium) {
        cams.push(
            cameraSeat(
                "podium",
                "seat",
                [f.cx, ft(13.5), f.maxZ + ft(24)],
                [f.cx, 0, f.cz + ft(10)],
            ),
        );
    }
    const ez = cfg.cameras.endZone;
    cams.push(
        cameraSeat(
            "endZone",
            "seat",
            [f.cx + ez.sx * (f.halfW + ez.dx), ez.y, f.cz],
            [f.cx, 0, f.cz],
        ),
        blimpCamera(f),
        topDownCamera(f, cfg.cameras.topDownHeight),
    );

    if (input.quality === "low") {
        root.traverse((o) => {
            o.castShadow = false;
        });
    }

    const setLighting = (preset: LightingPreset) => {
        if (!OUTDOOR_PRESETS.includes(preset)) return;
        const k = lightingValues(preset).kit;
        poles.forEach((p) => p.setOn(k.lampsOn, k.lampScale));
    };
    setLighting(cfg.defaultLighting);

    return {
        root,
        focus,
        cameras: cams,
        seatRows,
        pickTargets: stands.map((s) => s.pickTarget),
        crowdDensity: cfg.crowdDensity,
        lightingPresets: [...OUTDOOR_PRESETS],
        defaultLighting: cfg.defaultLighting,
        setLighting,
        dispose() {
            stands.forEach((s) => s.dispose());
            boards.forEach((b) => b.dispose());
            poles.forEach((p) => p.dispose());
            disposables.forEach((d) => d.dispose());
            geometries.forEach((g) => g.dispose());
            shared.dispose();
        },
    };
}
