// cspell:ignore superframe superframes
import {
    BufferGeometry,
    Float32BufferAttribute,
    Group,
    Mesh,
    type CanvasTexture,
} from "three";
import { repaintCanvasTexture } from "../../environment";
import type { LightingPreset, ShowCredits } from "../../types";
import { bowlOutline, type Ring } from "../bowl";
import { DIESEL_RING, type RingRange } from "./bowl";
import {
    dieselRibbonState,
    dieselTexture,
    paintRibbonLower,
    paintRibbonUpper,
    type DieselRibbonState,
} from "./brand";
import type { DieselCtx, DieselPart } from "./frame";
import { ledMaterial, type LedMaterial } from "./led";
import { dieselLighting } from "./lighting";

/**
 * The two LED ribbons of the Mark Diesel kit, in kit-root space:
 *
 * - the lower ribbon on the club fascia, all the way round the bowl: the
 *   show now performing and the bands after it;
 * - the upper ribbon on the terrace fascia, round the four corners and the
 *   ends: OpenMarch's logo and openmarch.com.
 *
 * Each is its own mesh a few centimeters in front of the bowl's fascia,
 * facing the field, and crawls slowly to the left while the window draws.
 */

/** How far in front of the bowl's fascia the ribbons' faces stand. */
export const RIBBON_PROUD = 0.06;
/** One texture tile is this many ribbon heights long. */
const TILE_HEIGHTS = 32;
/** Texture size of one tile. */
const TILE = { width: 4096, height: 128 };
/** Diodes across one tile and up the ribbon (a 4 cm pitch on the lower one). */
const CELLS: [number, number] = [TILE.width / 4, TILE.height / 4];
/** How fast each ribbon crawls, meters a second. */
const CRAWL = { lower: 0.5, upper: 0.35 };

/** Emissive level of the LED ribbons under a preset. */
export function dieselRibbonLevel(preset: LightingPreset): number {
    // By day the ribbons run harder, to hold up against the sunlit seats.
    return dieselLighting(preset).kit.lampsOn ? 1 : 1.25;
}

/**
 * A band between two rings over `ranges`, facing the inside of the bowl,
 * with U running left to right for someone on the field. Each range starts
 * at U = 0 and holds a whole number of tiles of about `tile` meters, so a
 * closed ring has no seam. Returns the geometry and each range's true tile
 * length in meters.
 */
export function ringStrip(
    bottom: Ring,
    top: Ring,
    ranges: RingRange[],
    tile: number,
): { geometry: BufferGeometry; tiles: number[] } {
    const n = bottom.length;
    const pos: number[] = [];
    const uv: number[] = [];
    const tiles: number[] = [];
    /** The point at fractional index `f` (ranges may end between points). */
    const pointAt = (ring: Ring, f: number) => {
        const i = Math.floor(f);
        return ring[i % n].clone().lerp(ring[(i + 1) % n], f - i);
    };
    for (const [i0, i1] of ranges) {
        /** The segments' ends: every ring point between `i0` and `i1`. */
        const fs = [i0];
        for (let f = Math.floor(i0) + 1; f < i1 - 1e-6; f++)
            if (f - i0 > 1e-6) fs.push(f);
        fs.push(i1);
        let length = 0;
        for (let k = 0; k + 1 < fs.length; k++)
            length += pointAt(bottom, fs[k]).distanceTo(
                pointAt(bottom, fs[k + 1]),
            );
        const tileLength = length / Math.max(1, Math.round(length / tile));
        tiles.push(tileLength);
        let along = 0;
        for (let k = 0; k + 1 < fs.length; k++) {
            const [fi, fj] = [fs[k], fs[k + 1]];
            const [p, q, r, t] = [
                pointAt(bottom, fi),
                pointAt(bottom, fj),
                pointAt(top, fj),
                pointAt(top, fi),
            ];
            const seg = p.distanceTo(q);
            // The rings run counterclockwise seen from above: to the left,
            // seen from the field. So U falls along the ring.
            const u0 = -along / tileLength;
            const u1 = -(along + seg) / tileLength;
            for (const [c, u, v] of [
                [p, u0, 0],
                [r, u1, 1],
                [q, u1, 0],
                [p, u0, 0],
                [t, u0, 1],
                [r, u1, 1],
            ] as const) {
                pos.push(c.x, c.y, c.z);
                uv.push(u, v);
            }
            along += seg;
        }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    return { geometry, tiles };
}

export interface DieselRibbons extends DieselPart {
    /** Shows the show's title on the lower ribbon (cheap to repeat). */
    setCredits(credits: ShowCredits): void;
}

export interface RibbonOptions {
    /** Draws the made-up bands (`dieselBandNames`); `Math.random` by default. */
    random?: () => number;
}

export function buildDieselRibbons(
    ctx: DieselCtx,
    options: RibbonOptions = {},
): DieselRibbons {
    const { BOWL } = ctx.frame;
    const ring = bowlOutline(BOWL.outline);
    const object = new Group();
    object.name = "markDiesel.ribbons";

    let state: DieselRibbonState = dieselRibbonState(options.random);
    const paintLower = (g: CanvasRenderingContext2D, w: number, h: number) =>
        paintRibbonLower(g, w, h, state);

    interface Ribbon {
        map: CanvasTexture;
        material: LedMaterial;
        geometry: BufferGeometry;
        /** Tiles crawled per meter. */
        perMeter: number;
        crawl: number;
    }
    const ribbon = (
        name: string,
        band: { offset: number; bottom: number; top: number },
        ranges: RingRange[],
        paint: (g: CanvasRenderingContext2D, w: number, h: number) => void,
        crawl: number,
    ): Ribbon => {
        const o = band.offset - RIBBON_PROUD;
        const { geometry, tiles } = ringStrip(
            ring(o, band.bottom),
            ring(o, band.top),
            ranges,
            (band.top - band.bottom) * TILE_HEIGHTS,
        );
        const map = dieselTexture(TILE.width, TILE.height, paint, {
            repeat: true,
        });
        const material = ledMaterial({ map, cells: CELLS });
        const mesh = new Mesh(geometry, material);
        mesh.name = name;
        object.add(mesh);
        return { map, material, geometry, perMeter: 1 / tiles[0], crawl };
    };
    const lower = ribbon(
        "markDiesel.ledRibbon1",
        BOWL.ribbon,
        [DIESEL_RING.main],
        paintLower,
        CRAWL.lower,
    );
    const upper = ribbon(
        "markDiesel.ledRibbon2",
        BOWL.ribbon2,
        DIESEL_RING.ribbon2,
        paintRibbonUpper,
        CRAWL.upper,
    );
    const ribbons = [lower, upper];

    const show = (next: DieselRibbonState) => {
        if (next.title === state.title) return;
        state = next;
        repaintCanvasTexture(lower.map, paintLower);
    };

    return {
        object,
        setCredits(credits) {
            show({ ...state, title: credits.title });
        },
        setLighting(preset) {
            const level = dieselRibbonLevel(preset);
            ribbons.forEach((r) => (r.material.uniforms.gain.value = level));
        },
        onFrame({ dt }) {
            // A long gap between frames (a paused show) must not jump the crawl.
            const step = Math.min(Math.max(dt, 0), 0.1);
            for (const r of ribbons) {
                const u = r.material.uniforms.scroll;
                u.value = (u.value + step * r.crawl * r.perMeter) % 1;
            }
        },
        dispose() {
            for (const r of ribbons) {
                r.geometry.dispose();
                r.map.dispose();
                r.material.dispose();
            }
            object.clear();
        },
    };
}
