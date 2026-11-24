// cspell:ignore metalness Daktronics
import {
    BufferGeometry,
    Float32BufferAttribute,
    Group,
    Mesh,
    Vector3,
    type Vector3Tuple,
} from "three";
import type { ShowCredits } from "../../types";
import { ledMaterial } from "../markDiesel/led";
import { Members } from "../pro/geometry";
import {
    AUX_BOARD,
    BOARD,
    BOARD_ATLAS,
    BOARD_FACE_RISE,
    BOARD_FACE_TOP,
} from "./boardPlan";
import { boardAtlasTexture, boardRingTexture } from "./boardTextures";
import type { NightpoundCtx, NightpoundPart } from "./frame";
import { nightpoundLighting } from "./lightLevels";
import { ROOF, roofDeckY, underNightpoundRoof } from "./roofPlan";

/**
 * The center-hung video board (Daktronics, 2017) over the arena's center:
 * the lower LED ring with its bottom 32 ft above the floor, four main
 * displays leaning out with a wedge display at each corner, a black cabinet
 * and the cables it hangs on. Also the auxiliary board in the back corner
 * at the entry end.
 *
 * The main faces show the show's credits; everything else stays quiet
 * (`boardTextures.ts`). Four draw calls: the screens (one atlas), the ring,
 * the cabinet shell and the boxes and cables.
 */

/** A screen that is off: LED black (#0A0A0A). */
const CABINET = 0x0b0b0c;
const FRAME = 0x141517;
const CABLE = 0x3a3b3e;
/** LED pitch on the boards, meters: coarse enough to see from row one. */
const PITCH = 0.015;
/**
 * The screens' brightness against white at `panelEmissive` 1. Modest: in
 * WGI's photo the faces are off, and a board at full brightness would pull
 * the eye off the floor.
 */
const SCREEN_GAIN = 0.85;
const RING_GAIN = 1.1;

type Region = { u0: number; v0: number; u1: number; v1: number };

/** Collects textured quads and trapezoids, wound to face outward. */
class Screens {
    readonly pos: number[] = [];
    readonly uv: number[] = [];

    /**
     * A screen facing `yaw` (0 = +Z) around (cx, cz): its bottom edge
     * `bottom` wide at `reach0` from the center and `y0`, its top edge `top`
     * wide at `reach1` and `y1`. `region` spans the wider edge.
     */
    add(
        center: [number, number],
        yaw: number,
        edges: { bottom: number; top: number },
        reach: [number, number],
        y: [number, number],
        region: Region,
    ): this {
        const [cx, cz] = center;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const widest = Math.max(edges.bottom, edges.top);
        const corner = (s: number, top: boolean) => {
            const half = (top ? edges.top : edges.bottom) / 2;
            const lx = s * half;
            const lz = top ? reach[1] : reach[0];
            this.pos.push(
                cx + lx * cos + lz * sin,
                top ? y[1] : y[0],
                cz - lx * sin + lz * cos,
            );
            const u = 0.5 + (s * half) / widest;
            this.uv.push(
                region.u0 + (region.u1 - region.u0) * u,
                top ? region.v1 : region.v0,
            );
        };
        corner(-1, false);
        corner(1, false);
        corner(1, true);
        corner(-1, false);
        corner(1, true);
        corner(-1, true);
        return this;
    }

    build(): BufferGeometry {
        const geometry = new BufferGeometry();
        geometry.setAttribute(
            "position",
            new Float32BufferAttribute(this.pos, 3),
        );
        geometry.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
        geometry.computeVertexNormals();
        return geometry;
    }
}

/**
 * The cabinet behind the main faces and wedges: an eight-sided shell that
 * follows their lean, a little behind them and a little past their top and
 * bottom edges, closed above and below.
 */
function shellGeometry(): BufferGeometry {
    const pos: number[] = [];
    const behind = 0.06;
    const ring = (t: number): Vector3Tuple[] => {
        const reach = BOARD.faceReach + BOARD.faceLean * t - behind;
        const y = BOARD.faceBottom + BOARD_FACE_RISE * t;
        const half = BOARD.faceWidth / 2;
        const out: Vector3Tuple[] = [];
        // Counterclockwise seen from above: the +Z face's two ends, then on.
        for (let k = 0; k < 4; k++) {
            const yaw = (k * Math.PI) / 2;
            const cos = Math.cos(yaw);
            const sin = Math.sin(yaw);
            for (const lx of [-half, half])
                out.push([
                    BOARD.x + lx * cos + reach * sin,
                    y,
                    BOARD.z - lx * sin + reach * cos,
                ]);
        }
        return out;
    };
    const lower = ring(-0.045);
    const upper = ring(1.06);
    const tri = (a: Vector3Tuple, b: Vector3Tuple, c: Vector3Tuple) =>
        pos.push(...a, ...b, ...c);
    for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        tri(lower[i], lower[j], upper[j]);
        tri(lower[i], upper[j], upper[i]);
    }
    for (let i = 1; i < 7; i++) {
        tri(upper[0], upper[i], upper[i + 1]);
        tri(lower[0], lower[i + 1], lower[i]);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geometry.computeVertexNormals();
    return geometry;
}

/** A part that also shows the show's credits. */
export interface NightpoundScoreboard extends NightpoundPart {
    setCredits(credits: ShowCredits): void;
}

// eslint-disable-next-line max-lines-per-function
export function buildScoreboard(ctx: NightpoundCtx): NightpoundScoreboard {
    const { shared } = ctx;
    const object = new Group();
    object.name = "nightpound.scoreboard";
    const center: [number, number] = [BOARD.x, BOARD.z];

    // The screens: four faces, four wedges and the auxiliary board.
    const screens = new Screens();
    const faceY: [number, number] = [BOARD.faceBottom, BOARD_FACE_TOP];
    const wedgeReach = (reach: number) =>
        (reach + BOARD.faceWidth / 2) / Math.SQRT2;
    for (let k = 0; k < 4; k++) {
        const yaw = (k * Math.PI) / 2;
        screens.add(
            center,
            yaw,
            { bottom: BOARD.faceWidth, top: BOARD.faceWidth },
            [BOARD.faceReach, BOARD.faceReach + BOARD.faceLean],
            faceY,
            BOARD_ATLAS.face,
        );
        const wedge = (reach: number) =>
            Math.SQRT2 * (reach - BOARD.faceWidth / 2);
        screens.add(
            center,
            yaw + Math.PI / 4,
            {
                bottom: wedge(BOARD.faceReach),
                top: wedge(BOARD.faceReach + BOARD.faceLean),
            },
            [
                wedgeReach(BOARD.faceReach),
                wedgeReach(BOARD.faceReach + BOARD.faceLean),
            ],
            faceY,
            BOARD_ATLAS.wedge,
        );
    }
    const auxDepth = 0.5;
    screens.add(
        [AUX_BOARD.x, AUX_BOARD.z],
        AUX_BOARD.yaw,
        { bottom: AUX_BOARD.width, top: AUX_BOARD.width },
        [auxDepth / 2 + 0.03, auxDepth / 2 + 0.03],
        [
            AUX_BOARD.y - AUX_BOARD.height / 2,
            AUX_BOARD.y + AUX_BOARD.height / 2,
        ],
        BOARD_ATLAS.aux,
    );
    const atlas = boardAtlasTexture();
    const screenGeo = screens.build();
    // One U of the atlas is a face's width; one V is two faces' heights.
    const screenMat = ledMaterial({
        map: atlas.texture,
        cells: [BOARD.faceWidth / PITCH, (2 * BOARD.faceHeight) / PITCH],
        gain: 0,
    });
    const screenMesh = new Mesh(screenGeo, screenMat);
    screenMesh.name = "nightpound.boardScreens";

    // The lower ring: four sides, each one tile of the ring's texture.
    const ring = new Screens();
    const ringY: [number, number] = [
        BOARD.ringBottom,
        BOARD.ringBottom + BOARD.ringHeight,
    ];
    for (let k = 0; k < 4; k++)
        ring.add(
            center,
            (k * Math.PI) / 2,
            { bottom: BOARD.ringSide, top: BOARD.ringSide },
            [BOARD.ringSide / 2, BOARD.ringSide / 2],
            ringY,
            { u0: 0, v0: 0, u1: 1, v1: 1 },
        );
    const ringMap = boardRingTexture();
    const ringGeo = ring.build();
    const ringMat = ledMaterial({
        map: ringMap,
        cells: [BOARD.ringSide / PITCH, BOARD.ringHeight / PITCH],
        gain: 0,
    });
    const ringMesh = new Mesh(ringGeo, ringMat);
    ringMesh.name = "nightpound.boardRing";

    const shellGeo = shellGeometry();
    const shell = new Mesh(
        shellGeo,
        shared.std(CABINET, { roughness: 0.55, metalness: 0.2 }),
    );
    shell.name = "nightpound.boardShell";

    // Boxes: the ring's backing, the neck between ring and faces, the top
    // frame, the cables up to the hoist beams, and the auxiliary board.
    const boxes = new Members();
    const at = (x: number, y: number, z: number) =>
        new Vector3(BOARD.x + x, y, BOARD.z + z);
    const ringTop = BOARD.ringBottom + BOARD.ringHeight;
    const inside = BOARD.ringSide - 0.1;
    boxes.box(
        at(0, BOARD.ringBottom + BOARD.ringHeight / 2 + 0.01, 0),
        [inside, BOARD.ringHeight - 0.02, inside],
        CABINET,
    );
    const neckTop = BOARD.faceBottom - 0.15;
    boxes.box(
        at(0, (ringTop + neckTop) / 2, 0),
        [inside - 0.5, neckTop - ringTop, inside - 0.5],
        FRAME,
    );
    const shellTop = BOARD.faceBottom + BOARD_FACE_RISE * 1.06;
    boxes.box(at(0, shellTop + 0.2, 0), [6.2, 0.4, 6.2], FRAME);
    for (const x of [-2.6, 2.6]) {
        boxes.box(at(x, shellTop + 0.55, 0), [0.3, 0.3, 7], FRAME);
        for (const z of [-2.6, 2.6])
            boxes.beam(
                at(x, shellTop + 0.7, z),
                at(x, ROOF.chordY, z),
                0.05,
                CABLE,
            );
    }
    const aux = new Vector3(AUX_BOARD.x, AUX_BOARD.y, AUX_BOARD.z);
    boxes.box(
        aux,
        [AUX_BOARD.width + 0.3, AUX_BOARD.height + 0.3, auxDepth],
        CABINET,
        AUX_BOARD.yaw,
    );
    const across = new Vector3(
        Math.cos(AUX_BOARD.yaw),
        0,
        -Math.sin(AUX_BOARD.yaw),
    );
    for (const s of [-0.4, 0.4]) {
        const foot = aux
            .clone()
            .addScaledVector(across, s * AUX_BOARD.width)
            .setY(AUX_BOARD.y + AUX_BOARD.height / 2 + 0.15);
        boxes.beam(
            foot,
            foot.clone().setY(roofDeckY(foot.x) - ROOF.joistDepth),
            0.05,
            CABLE,
        );
    }
    const boxMesh = boxes.build(
        shared.unitBox,
        shared.std(0xffffff, { roughness: 0.6, metalness: 0.2 }),
        "nightpound.boardBoxes",
    );

    object.add(shell, boxMesh, screenMesh, ringMesh);
    // The board hangs between the lamps and the floor; one shadow-casting
    // spot would print it on the tarp, where a real grid of lamps doesn't.
    object.traverse((o) => {
        o.castShadow = false;
        o.receiveShadow = false;
    });

    return {
        object,
        setLighting(preset) {
            const level = nightpoundLighting(preset).kit.panelEmissive;
            screenMat.uniforms.gain.value = SCREEN_GAIN * level;
            ringMat.uniforms.gain.value = RING_GAIN * level;
        },
        onFrame({ cameraPosition }) {
            // From above, the board would cover the middle of the floor.
            object.visible = underNightpoundRoof(cameraPosition[1]);
        },
        setCredits(credits) {
            atlas.setCredits(credits);
        },
        dispose() {
            screenGeo.dispose();
            screenMat.dispose();
            atlas.texture.dispose();
            ringGeo.dispose();
            ringMat.dispose();
            ringMap.dispose();
            shellGeo.dispose();
            boxMesh.dispose();
            object.clear();
        },
    };
}
