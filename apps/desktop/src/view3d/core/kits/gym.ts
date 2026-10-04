// cspell:ignore metalness
import {
    BackSide,
    BoxGeometry,
    DirectionalLight,
    Group,
    InstancedMesh,
    Matrix4,
    Mesh,
    PlaneGeometry,
    Quaternion,
    SpotLight,
    Vector3,
    type Object3D,
    type Vector3Tuple,
} from "three";
import {
    createSharedMaterials,
    lightingValues,
    type SharedMaterials,
} from "../environment";
import type {
    CameraSeat,
    FrameContext,
    KitBuilder,
    LightingPreset,
    SeatRow,
} from "../types";
import { bannerTexture, floorTexture } from "./gym/textures";

/** Room and bleacher dimensions in meters (design.md section 6, "gym"). */
export const GYM_ROOM_MARGIN = 9;
export const GYM_ROOM_HEIGHT = 11;
export const GYM_BLEACHER_ROWS = 12;
export const GYM_BLEACHER_TREAD = 0.73;
export const GYM_BLEACHER_RISE = 0.35;
export const GYM_BLEACHER_BASE = 0.43;
/** Gap between the performance area's front edge and the first bleacher row. */
export const GYM_BLEACHER_GAP = 3;
/** Wall clearance behind the top row. */
const BLEACHER_WALL_GAP = 0.6;
const EYE_ABOVE_TREAD = 1.22;

const BANNERS: [string[], string][] = [
    [["REGIONAL", "FINALIST", "2024"], "#6442ff"],
    [["STATE", "CHAMPIONS", "2025"], "#1f2a5c"],
    [["WINTER", "GUARD", "A CLASS"], "#a33a3a"],
    [["INDOOR", "PERCUSSION", "2025"], "#1f5c46"],
];

const m4 = new Matrix4();
const quat = new Quaternion();
const pos = new Vector3();
const scl = new Vector3();
const place = (
    mesh: InstancedMesh,
    i: number,
    p: Vector3Tuple,
    s: Vector3Tuple,
): void => {
    m4.compose(pos.set(...p), quat, scl.set(...s));
    mesh.setMatrixAt(i, m4);
};

/**
 * Indoor gym: a room sized to the footprint, maple floor with court lines and
 * safety tape, front-side bleachers, folded bleachers and banners on the back
 * wall, ceiling panels and house and show lighting. The tarp is the field
 * surface (P2.1); the floor sits at y = 0 so the surface at y = 0.02 lies on
 * top. The room extends past the footprint by 9 m on the sides and back, and
 * further in front so its front wall clears the bleachers.
 */
export const buildGym: KitBuilder = ({ footprint, quality }) => {
    const fp = footprint;
    const cx = (fp.minX + fp.maxX) / 2;
    const cz = (fp.minZ + fp.maxZ) / 2;
    const w = fp.maxX - fp.minX;
    const d = fp.maxZ - fp.minZ;
    const RH = GYM_ROOM_HEIGHT;

    const bleacherDepth = GYM_BLEACHER_ROWS * GYM_BLEACHER_TREAD;
    const frontPad = Math.max(
        GYM_ROOM_MARGIN,
        GYM_BLEACHER_GAP + bleacherDepth + BLEACHER_WALL_GAP,
    );
    const room = {
        minX: fp.minX - GYM_ROOM_MARGIN,
        maxX: fp.maxX + GYM_ROOM_MARGIN,
        minZ: fp.minZ - GYM_ROOM_MARGIN,
        maxZ: fp.maxZ + frontPad,
    };
    const roomW = room.maxX - room.minX;
    const roomD = room.maxZ - room.minZ;
    const roomCz = (room.minZ + room.maxZ) / 2;

    const shared: SharedMaterials = createSharedMaterials();
    const { std, unitBox } = shared;
    const geometries: { dispose(): void }[] = [];
    const root = new Group();
    root.name = "gym";

    // Room shell, seen from inside.
    const wall = () => std(0xd3cdbf, { side: BackSide });
    const end = () => std(0xc9c2b2, { side: BackSide });
    const roomGeo = new BoxGeometry(roomW, RH, roomD);
    geometries.push(roomGeo);
    const shell = new Mesh(roomGeo, [
        wall(),
        wall(),
        std(0x2a2b31, { side: BackSide }),
        std(0x2a2b31, { side: BackSide }),
        end(),
        end(),
    ]);
    shell.name = "gym-room";
    shell.position.set(cx, RH / 2 - 0.1, roomCz);
    shell.receiveShadow = true;
    root.add(shell);

    // Maple floor with court lines and safety tape.
    const floorGeo = new PlaneGeometry(roomW, roomD);
    geometries.push(floorGeo);
    const floor = new Mesh(
        floorGeo,
        std(0xffffff, {
            map: floorTexture({ ...room, footprint: fp }),
            roughness: 0.45,
        }),
    );
    floor.name = "gym-floor";
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, roomCz);
    floor.receiveShadow = true;
    root.add(floor);

    // Ceiling light panels, hidden when the camera is above the ceiling.
    const nx = Math.max(2, Math.round(roomW / 7.6));
    const nz = Math.max(2, Math.round(roomD / 9.1));
    const panelMat = std(0x222222, {
        emissive: 0xfff6e6,
        emissiveIntensity: lightingValues("house").kit.panelEmissive,
    });
    const panels = new InstancedMesh(unitBox, panelMat, nx * nz);
    panels.name = "gym-panels";
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
            place(
                panels,
                i * nz + j,
                [
                    room.minX + ((i + 0.5) * roomW) / nx,
                    RH - 0.4,
                    room.minZ + ((j + 0.5) * roomD) / nz,
                ],
                [2.4, 0.18, 1.2],
            );
        }
    }
    root.add(panels);

    // Bleachers: front side only, rising toward +z.
    const bleacherLength = Math.min(roomW - 1, w + 9);
    const bz0 = fp.maxZ + GYM_BLEACHER_GAP;
    const treadTop = (i: number) => GYM_BLEACHER_BASE + i * GYM_BLEACHER_RISE;
    const rowZ = (i: number) =>
        bz0 + i * GYM_BLEACHER_TREAD + GYM_BLEACHER_TREAD / 2;
    const rowsMesh = new InstancedMesh(
        unitBox,
        std(0x8e9098, { roughness: 0.95 }),
        GYM_BLEACHER_ROWS,
    );
    rowsMesh.name = "gym-bleachers";
    const benches = new InstancedMesh(
        unitBox,
        std(0xc8ccd4, { metalness: 0.5, roughness: 0.45 }),
        GYM_BLEACHER_ROWS,
    );
    benches.name = "gym-bleacher-benches";
    const seatRows: SeatRow[] = [];
    for (let i = 0; i < GYM_BLEACHER_ROWS; i++) {
        const h = treadTop(i);
        place(
            rowsMesh,
            i,
            [cx, h / 2, rowZ(i)],
            [bleacherLength, h, GYM_BLEACHER_TREAD],
        );
        place(
            benches,
            i,
            [cx, h + 0.41, bz0 + i * GYM_BLEACHER_TREAD + 0.23],
            [bleacherLength, 0.08, 0.27],
        );
        const z = bz0 + i * GYM_BLEACHER_TREAD + GYM_BLEACHER_TREAD * 0.42;
        seatRows.push({
            points: [
                [cx - bleacherLength / 2 + 0.5, h, z],
                [cx + bleacherLength / 2 - 0.5, h, z],
            ],
            closed: false,
            depth: GYM_BLEACHER_TREAD,
            side: "home",
        });
    }
    rowsMesh.castShadow = rowsMesh.receiveShadow = quality === "high";
    benches.receiveShadow = quality === "high";
    root.add(rowsMesh, benches);

    // Folded bleachers against the back wall.
    const foldedW = Math.min(roomW - 4, w + 6);
    const folded = new Mesh(unitBox, std(0x8a7a62));
    folded.name = "gym-folded-bleachers";
    folded.scale.set(foldedW, 4, 1.2);
    folded.position.set(cx, 2, room.minZ + 0.7);
    folded.castShadow = quality === "high";
    const slats = new InstancedMesh(unitBox, std(0x5b4e3c), 8);
    slats.name = "gym-folded-slats";
    for (let i = 0; i < 8; i++) {
        place(
            slats,
            i,
            [cx, 0.3 + i * 0.5, room.minZ + 1.32],
            [foldedW - 0.2, 0.08, 0.06],
        );
    }
    root.add(folded, slats);

    // Banners on the back wall, above the folded bleachers.
    const bannerGeo = new PlaneGeometry(2.7, 3.84);
    geometries.push(bannerGeo);
    const spacing = Math.min(7.3, (roomW - 4) / BANNERS.length);
    BANNERS.forEach(([lines, color], i) => {
        const m = new Mesh(
            bannerGeo,
            std(0xffffff, { map: bannerTexture(lines, color), roughness: 0.9 }),
        );
        m.name = `gym-banner-${i}`;
        m.position.set(
            cx + (i - (BANNERS.length - 1) / 2) * spacing,
            7.6,
            room.minZ + 0.09,
        );
        root.add(m);
    });

    // Lights: four show spots and one overhead directional.
    const spotX = Math.max(6, w * 0.44);
    const spotZs = [fp.maxZ + 7.6, fp.minZ - 7.6];
    const showSpots: SpotLight[] = [];
    for (const sx of [-1, 1]) {
        for (const sz of spotZs) {
            const sp = new SpotLight(0xf3eaff, 0, 0, 0.42, 0.7, 0);
            sp.position.set(cx + sx * spotX, RH - 0.6, sz);
            sp.target.position.set(cx + sx * spotX * 0.3, 0, cz);
            root.add(sp, sp.target);
            showSpots.push(sp);
        }
    }
    const overhead = new DirectionalLight(0xfff4e6, 1);
    overhead.position.set(cx + 9, 61, cz + 6);
    overhead.target.position.set(cx, 0, cz);
    overhead.castShadow = quality === "high";
    overhead.shadow.mapSize.set(2048, 2048);
    const half = Math.max(w, d) * 0.6 + 6;
    Object.assign(overhead.shadow.camera, {
        left: -half,
        right: half,
        top: half,
        bottom: -half,
        near: 15,
        far: 125,
    });
    overhead.shadow.camera.updateProjectionMatrix();
    root.add(overhead, overhead.target);

    const rowEye = (i: number, dx = 0): Vector3Tuple => [
        cx + dx,
        treadTop(i) + EYE_ABOVE_TREAD,
        rowZ(i),
    ];
    // High enough to frame the whole room at a 50 degree field of view, 16:9.
    const topY =
        Math.max(
            (d + 2 * frontPad) / (2 * Math.tan(Math.PI / 7.2)),
            roomW / (2 * Math.tan(Math.PI / 7.2) * 1.6),
            30,
        ) * 1.02;
    const cameras: CameraSeat[] = [
        {
            id: "geJudge",
            labelKey: "view3d.camera.geJudge",
            kind: "seat",
            position: rowEye(9),
            target: [cx, 0, cz - 0.6],
        },
        {
            id: "frontRow",
            labelKey: "view3d.camera.frontRow",
            kind: "seat",
            position: rowEye(0, -Math.min(4.3, bleacherLength * 0.2)),
            target: [cx - 1.8, 1.2, cz],
        },
        {
            id: "corner",
            labelKey: "view3d.camera.corner",
            kind: "aerial",
            position: [room.minX + 1.8, 7.3, fp.maxZ + 6],
            target: [cx, 0, cz],
        },
        {
            id: "floor",
            labelKey: "view3d.camera.floor",
            kind: "floor",
            position: [cx, 1.68, fp.minZ - 1],
            target: [cx, 1.83, fp.maxZ + 6.1],
        },
        {
            id: "topDown",
            labelKey: "view3d.camera.topDown",
            kind: "topDown",
            position: [cx, topY, cz + 0.06],
            target: [cx, 0, cz],
        },
    ];

    const lightingPresets: LightingPreset[] = ["house", "show"];
    const setLighting = (preset: LightingPreset): void => {
        if (!lightingPresets.includes(preset)) return;
        const k = lightingValues(preset).kit;
        panelMat.emissiveIntensity = k.panelEmissive;
        overhead.intensity = k.overheadIntensity;
        showSpots.forEach((s) => (s.intensity = k.showSpotIntensity));
    };
    setLighting("house");

    const pickTargets: Object3D[] = [rowsMesh];
    return {
        root,
        focus: [cx, 0, cz],
        cameras,
        seatRows,
        pickTargets,
        lightingPresets,
        defaultLighting: "house",
        setLighting,
        onFrame({ cameraPosition }: FrameContext) {
            panels.visible = cameraPosition[1] < RH - 0.5;
        },
        dispose() {
            geometries.forEach((g) => g.dispose());
            [rowsMesh, benches, panels, slats].forEach((m) => m.dispose());
            overhead.shadow.map?.dispose();
            shared.dispose();
            root.clear();
        },
    };
};
