// cspell:ignore superframe superframes wordmark
import {
    BufferGeometry,
    Float32BufferAttribute,
    Group,
    Mesh,
    MeshStandardMaterial,
} from "three";
import type { Ring } from "../bowl";
import { DIESEL_RING, dieselRings, dieselTunnelCuts } from "./bowl";
import {
    dieselTexture,
    dieselWallPadTexture,
    paintSponsorPanel,
    SPONSOR_HEIGHT,
    SPONSOR_PANELS,
    type SponsorPanel,
} from "./brand";
import type { DieselCtx, DieselFrame, DieselPart } from "./frame";
import { ringStrip } from "./ribbons";

/**
 * What stands round the field at field level, in kit-root space:
 *
 * - the padded wall's printed face: dark vinyl pads with OpenMarch's and On
 *   The Move's logos and openmarch.com in turn, a few centimeters in front
 *   of the bowl's wall, everywhere but under the drape (where the wall
 *   stays black);
 * - the sponsor boards: a row of low printed boards along the back
 *   sideline, in front of the wall under the drape: dark boards, with
 *   OpenMarch's logo, openmarch.com and On The Move's logo in the middle.
 *
 * Both are printed surfaces lit by the hall; the boards also glow a little,
 * so they read against the black behind them.
 */

/** How far in front of the bowl's wall the pads' faces stand. */
export const WALL_PROUD = 0.07;
/** One wall-pad texture tile is this many wall heights long. */
const PAD_TILE_HEIGHTS = 16;
/** The pads start this far above the floor. */
const PAD_FOOT = 0.03;

/** Sponsor boards: gap between boards, clearance in front of the wall, lean. */
const BOARD_GAP = 0.3;
const BOARD_CLEAR = 0.9;
const BOARD_FOOT = 0.05;
/** How far the top of a board leans back. */
const BOARD_LEAN = 0.12;
/** Atlas pixels per meter of board. */
const BOARD_PX = 128;
const ATLAS_WIDTH = 2048;
/** Pixels between atlas cells, so mipmaps don't bleed one board into the next. */
const GUTTER = 8;

/** One board in the atlas, in pixels. */
interface Cell {
    panel: SponsorPanel;
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Packs each distinct board into rows of an atlas `ATLAS_WIDTH` wide.
 * Returns the cells and the atlas height.
 */
export function packSponsorAtlas(panels: SponsorPanel[]): {
    cells: Cell[];
    height: number;
} {
    const cells: Cell[] = [];
    const h = SPONSOR_HEIGHT * BOARD_PX;
    let x = GUTTER;
    let y = GUTTER;
    for (const panel of new Set(panels)) {
        const w = panel.width * BOARD_PX;
        if (x + w + GUTTER > ATLAS_WIDTH) {
            x = GUTTER;
            y += h + GUTTER;
        }
        cells.push({ panel, x, y, w, h });
        x += w + GUTTER;
    }
    return { cells, height: y + h + GUTTER };
}

/**
 * The boards that fit along the back sideline's straight, and where each
 * stands: centers along X, from the audience's left (-X) to right. Boards
 * are dropped from both ends until the row fits.
 */
export function sponsorRow(
    frame: Pick<DieselFrame, "BOWL">,
    panels: SponsorPanel[] = SPONSOR_PANELS,
): { panel: SponsorPanel; x: number }[] {
    const { halfX, outline } = frame.BOWL;
    const room = 2 * (halfX - outline.cornerRadius) - 2;
    const row = [...panels];
    const length = () =>
        row.reduce((sum, p) => sum + p.width, 0) +
        BOARD_GAP * Math.max(0, row.length - 1);
    for (let end = 0; row.length > 0 && length() > room; end++)
        if (end % 2 === 0) row.shift();
        else row.pop();
    let x = -length() / 2;
    return row.map((panel) => {
        const center = x + panel.width / 2;
        x += panel.width + BOARD_GAP;
        return { panel, x: center };
    });
}

/**
 * Where the pads run along `ring` (the wall's face): the open part of the
 * ring, less the corner tunnels' mouths. Fractional ring indices.
 */
export function padRanges(
    frame: Pick<DieselFrame, "BOWL">,
    ring: Ring,
): [number, number][] {
    const n = ring.length;
    let pieces: [number, number][] = [[...DIESEL_RING.open]];
    for (const [g0, g1] of dieselTunnelCuts(frame, ring))
        for (const shift of [-n, 0, n])
            pieces = pieces.flatMap(([a, b]): [number, number][] => {
                const [c, d] = [g0 + shift, g1 + shift];
                if (d <= a || c >= b) return [[a, b]];
                return [
                    [a, c],
                    [d, b],
                ].filter(([x, y]) => y - x > 1e-6) as [number, number][];
            });
    return pieces;
}

export function buildDieselSurround(ctx: DieselCtx): DieselPart {
    const { BOWL } = ctx.frame;
    const object = new Group();
    object.name = "markDiesel.surround";

    // The wall's pads.
    // Round the field wall's squared corners, not across the corner
    // tunnels' mouths.
    const { ring } = dieselRings(ctx.frame);
    const padTop = BOWL.fieldWall;
    const foot = ring(-WALL_PROUD, PAD_FOOT);
    const pads = ringStrip(
        foot,
        ring(-WALL_PROUD, padTop),
        padRanges(ctx.frame, foot),
        (padTop - PAD_FOOT) * PAD_TILE_HEIGHTS,
    );
    const padMap = dieselWallPadTexture();
    const padMaterial = new MeshStandardMaterial({
        map: padMap,
        roughness: 0.55,
    });
    const padMesh = new Mesh(pads.geometry, padMaterial);
    padMesh.name = "markDiesel.wallPads";
    padMesh.receiveShadow = true;

    // The sponsor boards, all in one mesh on one atlas.
    const row = sponsorRow(ctx.frame);
    const atlas = packSponsorAtlas(row.map((r) => r.panel));
    const boardMap = dieselTexture(ATLAS_WIDTH, atlas.height, (g, w, h) => {
        g.fillStyle = "#0b0c10";
        g.fillRect(0, 0, w, h);
        for (const cell of atlas.cells) {
            g.save();
            g.translate(cell.x, cell.y);
            paintSponsorPanel(g, cell.panel, cell.w, cell.h);
            g.restore();
        }
    });
    const pos: number[] = [];
    const uv: number[] = [];
    const z = -(BOWL.halfZ - BOARD_CLEAR);
    const y0 = BOARD_FOOT;
    const y1 = BOARD_FOOT + SPONSOR_HEIGHT;
    // The backs take the atlas's dark ground, from inside the first gutter.
    const dark: [number, number] = [2 / ATLAS_WIDTH, 1 - 2 / atlas.height];
    for (const { panel, x } of row) {
        const cell = atlas.cells.find((c) => c.panel === panel)!;
        const [x0, x1] = [x - panel.width / 2, x + panel.width / 2];
        const [u0, u1] = [
            cell.x / ATLAS_WIDTH,
            (cell.x + cell.w) / ATLAS_WIDTH,
        ];
        const v0 = 1 - (cell.y + cell.h) / atlas.height;
        const v1 = 1 - cell.y / atlas.height;
        const top = z - BOARD_LEAN;
        // The face, toward the audience (+Z).
        pos.push(x0, y0, z, x1, y0, z, x1, y1, top);
        pos.push(x0, y0, z, x1, y1, top, x0, y1, top);
        uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
        // The back, toward the wall.
        pos.push(x1, y0, z, x0, y0, z, x0, y1, top);
        pos.push(x1, y0, z, x0, y1, top, x1, y1, top);
        for (let k = 0; k < 6; k++) uv.push(...dark);
    }
    const boardGeometry = new BufferGeometry();
    boardGeometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
    boardGeometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    boardGeometry.computeVertexNormals();
    const boardMaterial = new MeshStandardMaterial({
        map: boardMap,
        roughness: 0.6,
        emissive: 0xffffff,
        emissiveMap: boardMap,
        emissiveIntensity: 0.22,
    });
    const boards = new Mesh(boardGeometry, boardMaterial);
    boards.name = "markDiesel.sponsorStrip";
    boards.receiveShadow = true;

    object.add(padMesh, boards);
    return {
        object,
        setLighting() {},
        dispose() {
            pads.geometry.dispose();
            padMap.dispose();
            padMaterial.dispose();
            boardGeometry.dispose();
            boardMap.dispose();
            boardMaterial.dispose();
            object.clear();
        },
    };
}
