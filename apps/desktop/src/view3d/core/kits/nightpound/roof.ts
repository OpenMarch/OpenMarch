// cspell:ignore metalness
import {
    BufferGeometry,
    Color,
    CylinderGeometry,
    DoubleSide,
    Float32BufferAttribute,
    Group,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    Quaternion,
    Vector3,
    type Vector3Tuple,
} from "three";
import { paintCanvasTexture } from "../../environment";
import { Members } from "../pro/geometry";
import type { NightpoundCtx, NightpoundPart } from "./frame";
import { nightpoundLighting } from "./lightLevels";
import { ARENA_CENTER_Z } from "./plan";
import { buildCans } from "./roofCans";
import { buildFlags } from "./roofFlags";
import {
    CAN,
    FLAGS,
    ROOF,
    ROOF_WALL_FOOT,
    SPEAKER,
    flagLeft,
    roofDeckY,
    speakerLayout,
    trussStations,
    underNightpoundRoof,
    type CanLight,
} from "./roofPlan";

/**
 * Nightpound's roof: thirteen black trusses across the hall with joists and
 * a ribbed deck on top, catwalks at the bottom chords, the grid of white can
 * lights under them, line arrays around the board and over the ends, round
 * ducts and diffusers, the flags of nations on the back side, and the black
 * walls from the roof down to the top of the stands.
 *
 * Six draw calls: the steel (every box, one instanced mesh), the round
 * things (can housings, ducts and diffusers, one instanced mesh), the deck,
 * the walls, the flags, and the cans' faces and glare (`roofCans.ts`).
 *
 * The whole part hides when the camera rises above the bottom chords, so
 * top-down and aerial views see into the hall.
 */

/**
 * Roof steel. It is #1B1C1E as the photos show it, lit; these are lighter,
 * since up here the steel gets only the hall's dim bounce.
 */
const STEEL = 0x5a5b60;
const JOIST = 0x66676c;
const CATWALK = 0x303134;
const CABLE = 0x5a5b5e;
const HOUSING = 0x1c1c1f;
const SPEAKER_BLACK = 0x17171a;
const SPEAKER_GRILLE = 0x2a2b2e;
const DUCT = 0x55565a;
const DIFFUSER = 0x3a3b3e;
const DIFFUSER_PLATE = 0x8a8c90;
const WALL = 0x0e0f11;

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** One truss at `z`: flat bottom chord, top chord under the pitched deck. */
function addTruss(steel: Members, z: number, bays: number): void {
    const chord = 0.5;
    const web = 0.26;
    const bottom = (x: number) => v(x, ROOF.chordY + chord / 2, z);
    const top = (x: number) =>
        v(x, roofDeckY(x) - ROOF.joistDepth - chord / 2, z);
    const x = (i: number) => -ROOF.halfX + (2 * ROOF.halfX * i) / bays;
    steel.beam(bottom(-ROOF.halfX), bottom(ROOF.halfX), chord, STEEL);
    steel.beam(top(-ROOF.halfX), top(0), chord, STEEL);
    steel.beam(top(0), top(ROOF.halfX), chord, STEEL);
    for (let i = 0; i <= bays; i++) {
        steel.beam(bottom(x(i)), top(x(i)), web, STEEL);
        if (i === bays) break;
        // Diagonals fall toward the middle of the span, as in a Pratt truss.
        const inward = x(i) < 0;
        steel.beam(
            inward ? top(x(i)) : bottom(x(i)),
            inward ? bottom(x(i + 1)) : top(x(i + 1)),
            web,
            STEEL,
        );
    }
}

/**
 * One joist along Z at `x`, just under the deck. At high quality an open
 * web (two chords and a zigzag); at low quality one deep bar.
 */
function addJoist(steel: Members, x: number, open: boolean): void {
    const top = roofDeckY(x) - 0.06;
    const bottom = top - ROOF.joistDepth + 0.1;
    if (!open) {
        const mid = (top + bottom) / 2;
        steel.beam(
            v(x, mid, ROOF.minZ),
            v(x, mid, ROOF.maxZ),
            0.12,
            JOIST,
            ROOF.joistDepth,
        );
        return;
    }
    steel.beam(v(x, top, ROOF.minZ), v(x, top, ROOF.maxZ), 0.14, JOIST, 0.1);
    steel.beam(
        v(x, bottom, ROOF.minZ),
        v(x, bottom, ROOF.maxZ),
        0.14,
        JOIST,
        0.1,
    );
    const step = 1.3;
    const n = Math.round((ROOF.maxZ - ROOF.minZ) / step);
    for (let i = 0; i < n; i++) {
        const z0 = ROOF.minZ + ((ROOF.maxZ - ROOF.minZ) * i) / n;
        const z1 = ROOF.minZ + ((ROOF.maxZ - ROOF.minZ) * (i + 1)) / n;
        const up = i % 2 === 0;
        steel.beam(
            v(x, up ? bottom : top, z0),
            v(x, up ? top : bottom, z1),
            0.06,
            JOIST,
        );
    }
}

/** A catwalk from `a` to `b` at the bottom chords: a deck and two rails. */
function addCatwalk(
    steel: Members,
    a: Vector3,
    b: Vector3,
    posts: boolean,
): void {
    const along = b.clone().sub(a);
    const length = along.length();
    along.normalize();
    const side = new Vector3(along.z, 0, -along.x);
    const y = ROOF.chordY + 0.55;
    const at = (t: number, s: number, h: number) =>
        a
            .clone()
            .addScaledVector(along, t)
            .addScaledVector(side, s)
            .setY(y + h);
    steel.beam(at(0, 0, 0), at(length, 0, 0), 1, CATWALK, 0.08);
    for (const s of [-0.5, 0.5]) {
        steel.beam(at(0, s, 1.05), at(length, s, 1.05), 0.05, CATWALK);
        steel.beam(at(0, s, 0.55), at(length, s, 0.55), 0.04, CATWALK);
        if (!posts) continue;
        const n = Math.round(length / 2.4);
        for (let i = 0; i <= n; i++) {
            const t = (length * i) / n;
            steel.beam(at(t, s, 0), at(t, s, 1.05), 0.05, CATWALK);
        }
    }
}

/**
 * A line array hung at `position`, playing along `yaw`: a stack of cabinets
 * that curls under toward the seats below (one box at low quality), a
 * rigging frame and two cables to the steel.
 */
function addSpeaker(
    steel: Members,
    [x, y, z]: Vector3Tuple,
    yaw: number,
    detailed: boolean,
): void {
    const out = v(Math.sin(yaw), 0, Math.cos(yaw));
    const across = v(Math.cos(yaw), 0, -Math.sin(yaw));
    const top = v(x, y, z);
    steel.box(top.clone().setY(y + 0.08), [1.3, 0.12, 1.1], CATWALK, yaw);
    for (const s of [-0.5, 0.5]) {
        const foot = top
            .clone()
            .addScaledVector(across, s)
            .setY(y + 0.1);
        steel.beam(foot, foot.clone().setY(ROOF.chordY + 0.25), 0.04, CABLE);
    }
    if (!detailed) {
        steel.box(
            top.clone().setY(y - SPEAKER.height / 2),
            [SPEAKER.width, SPEAKER.height, SPEAKER.depth],
            SPEAKER_BLACK,
            yaw,
        );
        return;
    }
    const boxes = 6;
    const h = SPEAKER.height / boxes;
    const axes = (i: number) => {
        const tilt = (4 + i * 6.5) * (Math.PI / 180);
        return {
            forward: out
                .clone()
                .multiplyScalar(Math.cos(tilt))
                .setY(-Math.sin(tilt)),
            up: out.clone().multiplyScalar(Math.sin(tilt)).setY(Math.cos(tilt)),
        };
    };
    let center = top.clone().addScaledVector(axes(0).up, -h / 2);
    for (let i = 0; i < boxes; i++) {
        const { forward, up } = axes(i);
        if (i > 0)
            center = center
                .clone()
                .addScaledVector(axes(i - 1).up, -h / 2)
                .addScaledVector(up, -h / 2);
        const half = SPEAKER.depth / 2;
        steel.beam(
            center.clone().addScaledVector(forward, -half),
            center.clone().addScaledVector(forward, half),
            SPEAKER.width,
            SPEAKER_BLACK,
            h * 0.94,
        );
        // The grille: a lighter face on the front of each cabinet.
        steel.beam(
            center.clone().addScaledVector(forward, half),
            center.clone().addScaledVector(forward, half + 0.02),
            SPEAKER.width * 0.92,
            SPEAKER_GRILLE,
            h * 0.8,
        );
    }
}

/** Round things as instances of one unit cylinder (radius 1, height 1). */
class Rounds {
    private readonly matrices: Matrix4[] = [];
    private readonly colors: Color[] = [];
    private static readonly UP = new Vector3(0, 1, 0);

    /** A cylinder from `a` to `b`. */
    add(a: Vector3, b: Vector3, radius: number, color: number): this {
        const axis = b.clone().sub(a);
        const length = axis.length();
        const q = new Quaternion().setFromUnitVectors(
            Rounds.UP,
            axis.divideScalar(length),
        );
        this.matrices.push(
            new Matrix4().compose(
                a.clone().add(b).multiplyScalar(0.5),
                q,
                new Vector3(radius, length, radius),
            ),
        );
        this.colors.push(new Color(color));
        return this;
    }

    build(geometry: CylinderGeometry, material: MeshStandardMaterial) {
        const mesh = new InstancedMesh(
            geometry,
            material,
            Math.max(1, this.matrices.length),
        );
        this.matrices.forEach((m, i) => {
            mesh.setMatrixAt(i, m);
            mesh.setColorAt(i, this.colors[i]);
        });
        mesh.count = this.matrices.length;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.computeBoundingBox();
        return mesh;
    }
}

/** The cans' housings and the pendants they hang on. */
function addCanHousings(
    steel: Members,
    rounds: Rounds,
    cans: CanLight[],
    stations: number[],
): void {
    for (const {
        position: [x, y, z],
    } of cans) {
        rounds.add(
            v(x, y - 0.01, z),
            v(x, y + CAN.height, z),
            CAN.radius,
            HOUSING,
        );
        // Under a truss the pendant is short; between trusses it runs up
        // to the joists.
        const underTruss = stations.some((s) => Math.abs(s - z) < 0.1);
        const head = underTruss ? ROOF.chordY : roofDeckY(x) - ROOF.joistDepth;
        steel.beam(v(x, y + CAN.height, z), v(x, head, z), 0.05, HOUSING);
    }
}

/** Round diffusers between the trusses and the big ducts along the ends. */
function addDucts(rounds: Rounds, stations: number[], detailed: boolean): void {
    for (let k = 0; k + 1 < stations.length; k++) {
        const z = (stations[k] + stations[k + 1]) / 2;
        for (const x of [-22, -8.4, 8.4, 22]) {
            const y = roofDeckY(x) - 2;
            rounds.add(v(x, y, z), v(x, y + 0.4, z), 0.6, DIFFUSER);
            if (!detailed) continue;
            rounds.add(v(x, y - 0.05, z), v(x, y, z), 0.42, DIFFUSER_PLATE);
            rounds.add(v(x, y + 0.4, z), v(x, roofDeckY(x), z), 0.28, DUCT);
        }
    }
    for (const sx of [-1, 1]) {
        const x = sx * (ROOF.halfX - 3.6);
        const y = ROOF.chordY + 1.5;
        rounds.add(v(x, y, ROOF.minZ + 1), v(x, y, ROOF.maxZ - 1), 0.75, DUCT);
    }
}

/** The pipes the two rows of flags hang from, and their cables. */
function addFlagRigging(steel: Members): void {
    const row = FLAGS.count / 2;
    const y = FLAGS.topY + 0.04;
    for (const first of [0, row]) {
        const x0 = flagLeft(first) - 0.15;
        const x1 = flagLeft(first + row - 1) + FLAGS.width + 0.15;
        steel.beam(v(x0, y, FLAGS.z), v(x1, y, FLAGS.z), 0.06, CABLE);
        for (const x of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3])
            steel.beam(
                v(x, y, FLAGS.z),
                v(x, roofDeckY(x) - ROOF.joistDepth, FLAGS.z),
                0.025,
                CABLE,
            );
    }
}

/** The deck's underside: two slopes from the ridge, ribbed across the joists. */
function deckGeometry(): BufferGeometry {
    const pos: number[] = [];
    const uv: number[] = [];
    // One texture tile is four ribs, 0.8 m.
    const tile = 0.8;
    const quad = (pts: Vector3Tuple[]) => {
        for (const i of [0, 1, 2, 0, 2, 3]) {
            pos.push(...pts[i]);
            uv.push(pts[i][2] / tile, pts[i][0] / tile);
        }
    };
    const { halfX, minZ, maxZ, ridgeY, eaveY } = ROOF;
    // Wound to face down.
    quad([
        [-halfX, eaveY, minZ],
        [0, ridgeY, minZ],
        [0, ridgeY, maxZ],
        [-halfX, eaveY, maxZ],
    ]);
    quad([
        [0, ridgeY, minZ],
        [halfX, eaveY, minZ],
        [halfX, eaveY, maxZ],
        [0, ridgeY, maxZ],
    ]);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * The black walls above the stands, a hand's width outside the bowl's own
 * rear walls: the back and the front from the top row up to the pitched
 * deck, and the two ends from the ceiling over the end decks.
 */
function wallGeometry(): BufferGeometry {
    const pos: number[] = [];
    const quad = (pts: Vector3Tuple[]) => {
        for (const i of [0, 1, 2, 0, 2, 3]) pos.push(...pts[i]);
    };
    const out = 0.15;
    const { halfX, minZ, maxZ, ridgeY, eaveY } = ROOF;
    const x = halfX + out;
    for (const z of [minZ - out, maxZ + out]) {
        const foot = ROOF_WALL_FOOT.sides;
        quad([
            [-x, foot, z],
            [0, foot, z],
            [0, ridgeY, z],
            [-x, eaveY, z],
        ]);
        quad([
            [0, foot, z],
            [x, foot, z],
            [x, eaveY, z],
            [0, ridgeY, z],
        ]);
    }
    for (const sx of [-1, 1])
        quad([
            [sx * x, ROOF_WALL_FOOT.ends, minZ - out],
            [sx * x, ROOF_WALL_FOOT.ends, maxZ + out],
            [sx * x, eaveY, maxZ + out],
            [sx * x, eaveY, minZ - out],
        ]);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geometry.computeVertexNormals();
    return geometry;
}

// eslint-disable-next-line max-lines-per-function
export function buildRoof(ctx: NightpoundCtx): NightpoundPart {
    const { shared, quality } = ctx;
    const high = quality === "high";
    const object = new Group();
    object.name = "nightpound.roof";
    const stations = trussStations();

    const steel = new Members();
    stations.forEach((z) =>
        addTruss(steel, z, high ? ROOF.trussBays : ROOF.trussBays / 2),
    );
    const joists = Math.floor(ROOF.halfX / ROOF.joistPitch);
    for (let k = -joists; k <= joists; k++)
        addJoist(steel, k * ROOF.joistPitch, high);
    for (const dz of [-9, 9])
        addCatwalk(
            steel,
            v(-ROOF.halfX + 0.5, 0, ARENA_CENTER_Z + dz),
            v(ROOF.halfX - 0.5, 0, ARENA_CENTER_Z + dz),
            high,
        );
    for (const x of [-14, 14])
        addCatwalk(
            steel,
            v(x, 0, ROOF.minZ + 1.5),
            v(x, 0, ROOF.maxZ - 1.5),
            high,
        );
    // The beams the center-hung board's cables come down from.
    for (const x of [-2.6, 2.6])
        steel.beam(
            v(x, ROOF.chordY + 0.25, ARENA_CENTER_Z - ROOF.trussPitch),
            v(x, ROOF.chordY + 0.25, ARENA_CENTER_Z + ROOF.trussPitch),
            0.3,
            STEEL,
            0.5,
        );
    speakerLayout().forEach(({ position, yaw }) =>
        addSpeaker(steel, position, yaw, high),
    );
    addFlagRigging(steel);

    const rounds = new Rounds();
    const cans = buildCans(quality);
    addCanHousings(steel, rounds, cans.layout, stations);
    addDucts(rounds, stations, high);

    const steelMesh = steel.build(
        shared.unitBox,
        shared.std(0xffffff, { roughness: 0.75, metalness: 0.1 }),
        "nightpound.roofSteel",
    );
    const cylinder = new CylinderGeometry(1, 1, 1, high ? 12 : 6);
    const roundsMesh = rounds.build(
        cylinder,
        shared.std(0xffffff, { roughness: 0.7, metalness: 0.1 }),
    );
    roundsMesh.name = "nightpound.roofRounds";

    const deckMap = paintCanvasTexture(
        64,
        64,
        (g) => {
            g.fillStyle = "#3e3f44";
            g.fillRect(0, 0, 64, 64);
            // Four ribs a tile: a lit flat and a dark flute.
            g.fillStyle = "#26272a";
            for (let i = 0; i < 4; i++) g.fillRect(i * 16 + 9, 0, 7, 64);
            g.fillStyle = "#525358";
            for (let i = 0; i < 4; i++) g.fillRect(i * 16, 0, 2, 64);
        },
        { repeat: true },
    );
    const deckMat = new MeshStandardMaterial({
        map: deckMap,
        roughness: 0.9,
        side: DoubleSide,
    });
    const deckGeo = deckGeometry();
    const deck = new Mesh(deckGeo, deckMat);
    deck.name = "nightpound.roofDeck";

    const wallGeo = wallGeometry();
    const walls = new Mesh(
        wallGeo,
        shared.std(WALL, { roughness: 0.95, side: DoubleSide }),
    );
    walls.name = "nightpound.roofWalls";

    const flags = buildFlags();
    object.add(steelMesh, roundsMesh, deck, walls, flags.mesh, cans.object);
    // Nothing up here shades the floor: the lamps hang below the steel.
    object.traverse((o) => {
        o.castShadow = false;
        o.receiveShadow = false;
    });

    return {
        object,
        setLighting(preset) {
            cans.setLevel(nightpoundLighting(preset).kit.barEmissive);
        },
        onFrame({ cameraPosition }) {
            object.visible = underNightpoundRoof(cameraPosition[1]);
        },
        dispose() {
            cans.dispose();
            flags.dispose();
            steelMesh.dispose();
            roundsMesh.dispose();
            cylinder.dispose();
            deckGeo.dispose();
            deckMap.dispose();
            deckMat.dispose();
            wallGeo.dispose();
            object.clear();
        },
    };
}
