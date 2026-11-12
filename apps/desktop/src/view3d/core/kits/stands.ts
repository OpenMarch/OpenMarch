// cspell:ignore metalness
import {
    Group,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    type Object3D,
    type Vector3Tuple,
} from "three";
import {
    createSharedMaterials,
    ft,
    GROUND_LAYER,
    lightingValues,
    lightPole,
    setGroundLayer,
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
 * The shared builder behind the `hs` and `bighs` kits, and the pieces `blank`
 * reuses (P2.3), in meters, with everything placed relative to the field
 * footprint (design.md section 6). The stands, track and surroundings are the
 * kit's own (`KitDress`).
 *
 * The field surface itself is P2.1's job. These kits only leave the footprint
 * area free.
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
    /** The seating surface: what pick-a-seat raycasts against. */
    pickTarget: Object3D;
    /** Eye position in front of the press box glass, kit frame. */
    pressEye?: Vector3Tuple;
    /** Eye position above row `i`, kit frame. */
    rowEye(i: number): Vector3Tuple;
    dispose(): void;
}

export interface TrackResult {
    objects: Object3D[];
    dispose(): void;
}

/** A flat ground plane, centered at (x, y, z), on `GROUND_LAYER.ground`. */
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
    const mesh = new Mesh(
        geometry,
        setGroundLayer(material, GROUND_LAYER.ground),
    );
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

export const PODIUM = { w: ft(6), h: ft(8), d: ft(6), z: ft(26) };

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

/** What a kit's `dress` hook is given. */
export interface DressContext {
    frame: Frame;
    shared: SharedMaterials;
    input: KitBuildInput;
}

/**
 * A kit's own stands, track and surroundings (`hs` and `bighs` build these in
 * `kits/hs/`).
 */
export interface KitDress {
    /** Builds one stand. */
    buildStand(spec: StandSpec, placement: StandPlacement): Stand;
    /** Builds the track. */
    buildTrack(): TrackResult;
    /** Builds the podium, standing at `position`. */
    buildPodium(position: Vector3Tuple, size: typeof PODIUM): void;
    /**
     * Called once every stand is built. Returns what goes in the kit root,
     * which is the place to draw batches shared by the stands.
     */
    finish(): Object3D[];
    setLighting(preset: LightingPreset): void;
    dispose(): void;
}

export interface StandsKitConfig {
    id: Extract<VenueKitId, "hs" | "bighs">;
    groundColor: number;
    track: boolean;
    /** Gap from the sideline to the stand's front edge. */
    front: { spec: Omit<StandSpec, "side">; gap: number };
    back: { spec: Omit<StandSpec, "side">; gap: number };
    board?: {
        w: number;
        h: number;
        legs: number;
        /** Center of the board past the side-2 end edge. */
        dx: number;
        /** Height of the screen center. */
        y: number;
    };
    podium: boolean;
    poles: { height: number; spots: PoleSpot[] };
    cameras: {
        /** The press box camera aims this far behind the field center. */
        pressTargetBack: number;
        /** End-zone camera: end, distance past the end edge and height. */
        endZone: { sx: -1 | 1; dx: number; y: number; dz?: number };
        topDownHeight: number;
    };
    crowdDensity: number;
    defaultLighting: LightingPreset;
    /** The kit's own stands, track and surroundings. */
    dress: (ctx: DressContext) => KitDress;
}

const FRONT_ROW_OFFSET = -ft(36);

/**
 * Shared builder for the rectangular-stand kits. Builds the ground, the
 * stands, extras and poles, then returns the
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
    const dress = cfg.dress({ frame: f, shared, input });

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
    if (cfg.track) {
        const track = dress.buildTrack();
        root.add(...track.objects);
        disposables.push(track);
    }

    const stands: Stand[] = [];
    const addStand = (
        spec: Omit<StandSpec, "side">,
        side: SeatRow["side"],
        placement: StandPlacement,
    ) => {
        const full = { ...spec, side };
        const stand = dress.buildStand(full, placement);
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
    const boards: VideoBoard[] = [];
    if (cfg.board) {
        const b = cfg.board;
        const board = videoBoard(b.w, b.h, b.legs, shared);
        board.object.position.set(f.maxX + b.dx, b.y, f.cz);
        board.object.rotation.y = -Math.PI / 2;
        root.add(board.object);
        boards.push(board);
    }

    if (cfg.podium) {
        dress.buildPodium([f.cx, 0, f.maxZ + PODIUM.z], PODIUM);
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

    root.add(...dress.finish());
    disposables.push(dress);

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
            [f.cx + ez.sx * (f.halfW + ez.dx), ez.y, f.cz + (ez.dz ?? 0)],
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
        dress.setLighting(preset);
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
        setShowCredits(credits) {
            boards.forEach((b) => b.setCredits(credits));
        },
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
