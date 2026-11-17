// cspell:ignore metalness
import { Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { ft } from "../../environment";
import { type BoxBatch, QuadBuilder } from "./geometry";
import { PRESS_FRONT_BAND, PRESS_REAR_BAND, pressBoxFacade } from "./textures";

/**
 * A press box that reads as a building at press box distance: a siding body
 * with a painted fascia, a glass band with real mullions and a few opened
 * shutters, an overhanging roof with a filming deck, columns to the ground and
 * a stair tower. Built in the stand's own frame (front edge at z = 0, rising
 * toward +z). The solid parts go into the kit's batches, so the facade is the
 * only draw call of its own.
 */

export interface PressBoxInput {
    width: number;
    height: number;
    lift: number;
    stories: number;
    /** Height of the stand's top tread. */
    top: number;
    /** Back edge of the stand (rows x depth). */
    back: number;
    homeColor: string;
    /** Fascia text, or empty for the OpenMarch logo. */
    text: string;
    high: boolean;
    steel: BoxBatch;
    props: BoxBatch;
}

export interface PressBox {
    group: Group;
    /** Eye position in the stand frame, in front of the top story's glass. */
    eye: [number, number, number];
    /** Window glow, 0 (day) to 1 (night). */
    setGlow(k: number): void;
    dispose(): void;
}

const SIDING = 0xd0c9ba;
const ROOF = 0x3a3d43;
const SLAB = 0x9b978e;

export function buildPressBox(p: PressBoxInput): PressBox {
    const { width: W, height: H, stories, high, steel: s, props } = p;
    const depth = stories > 1 ? ft(24) : ft(14);
    const y0 = p.top + p.lift;
    const zb = p.back;
    const storyH = H / stories;
    const group = new Group();
    group.name = "pressBox";

    const overhang = ft(4);
    props.add(
        [0, y0 + H / 2, zb + depth / 2],
        [W, H, depth],
        [0, 0, 0],
        SIDING,
    );
    props.add(
        [0, y0 + H + ft(0.6), zb + depth / 2 - overhang / 2],
        [W + ft(3), ft(1.2), depth + overhang + ft(1)],
        [0, 0, 0],
        ROOF,
    );
    props.add(
        [0, y0 - ft(0.7), zb + depth / 2],
        [W + ft(1), ft(1.4), depth + ft(1)],
        [0, 0, 0],
        SLAB,
    );

    // The facade texture: glass and fascia, front and rear, lit at night.
    const tex = pressBoxFacade(W, H, stories, p.homeColor, p.text, high);
    const mat = new MeshStandardMaterial({
        map: tex.map,
        emissive: 0xffffff,
        emissiveMap: tex.emissive,
        emissiveIntensity: 0,
        roughness: 0.55,
        metalness: 0.1,
    });
    const q = new QuadBuilder();
    const put = (zFace: number, dir: 1 | -1, band: [number, number]) => {
        q.quad(
            new Vector3(-W / 2, y0, zFace),
            new Vector3(W / 2, y0, zFace),
            new Vector3(W / 2, y0 + H, zFace),
            new Vector3(-W / 2, y0 + H, zFace),
            [dir < 0 ? 1 : 0, band[0]],
            [dir < 0 ? 0 : 1, band[0]],
            [dir < 0 ? 0 : 1, band[1]],
            [dir < 0 ? 1 : 0, band[1]],
            undefined,
            new Vector3(0, 0, dir),
        );
    };
    put(zb - 0.03, -1, PRESS_FRONT_BAND);
    put(zb + depth + 0.03, 1, PRESS_REAR_BAND);
    const geo = q.build();
    const facade = new Mesh(geo, mat);
    facade.name = "pressBoxFace";
    facade.receiveShadow = true;
    group.add(facade);

    if (high) {
        detail();
    } else {
        // Two columns are all the low path needs to stand it up.
        for (const sx of [-1, 1]) {
            const x = (sx * W) / 2.4;
            s.add(
                [x, (y0 - ft(1.4)) / 2, zb + depth * 0.7],
                [ft(1), y0 - ft(1.4), ft(1)],
            );
        }
    }

    function detail() {
        // Mullions in the glass band, so the windows have depth.
        const bays = Math.round(W / ft(7));
        const bayW = W / bays;
        for (let st = 0; st < stories; st++) {
            const y = y0 + storyH * (st + 0.47);
            const h = storyH * 0.62;
            for (let i = 0; i <= bays; i++) {
                const x = -W / 2 + i * bayW;
                props.add(
                    [x, y, zb - 0.1],
                    [ft(0.4), h, 0.16],
                    [0, 0, 0],
                    0x34373d,
                );
            }
            // Slab edge between floors, and a sill under the glass.
            props.add(
                [0, y0 + storyH * st + ft(0.35), zb - 0.1],
                [W + 0.1, ft(0.7), 0.3],
                [0, 0, 0],
                st === 0 ? SLAB : 0xb8b2a4,
            );
            // Top-hinged shutters propped open on some of the outer bays.
            for (let i = 0; i < bays; i += 3) {
                const x = -W / 2 + (i + 0.5) * bayW;
                if (Math.abs(x) < ft(14)) continue;
                const open = 0.7;
                const sh = h * 0.7;
                props.add(
                    [x, y + h * 0.42, zb - 0.18 - (Math.sin(open) * sh) / 2],
                    [bayW * 0.84, sh, 0.05],
                    [open, 0, 0],
                    0xb5ae9e,
                );
            }
        }

        // Columns from the ground at the back, and bracing between them.
        const col = stories > 1 ? ft(2.2) : ft(1);
        const nCols = Math.max(2, Math.round(W / 7) + 1);
        for (let i = 0; i < nCols; i++) {
            const x = -W / 2 + col + ((W - 2 * col) * i) / (nCols - 1);
            const zBack = zb + depth - col;
            const yTop = y0 - ft(1.4);
            s.add([x, yTop / 2, zBack], [col, yTop, col]);
            s.add(
                [x, yTop / 2, zb + depth * 0.45],
                [col * 0.8, yTop, col * 0.8],
            );
            if (i < nCols - 1 && i % 2 === 0) {
                const x2 =
                    -W / 2 + col + ((W - 2 * col) * (i + 1)) / (nCols - 1);
                s.beam([x, 0.3, zBack], [x2, y0 - ft(2), zBack], ft(0.5));
                s.beam([x2, 0.3, zBack], [x, y0 - ft(2), zBack], ft(0.5));
            }
        }

        // Filming deck: railing, tripods, and the roof's mechanical units.
        const yr = y0 + H + ft(1.2);
        const rail = ft(3.5);
        const zf = zb - overhang + ft(0.5);
        const zr = zb + depth;
        for (let x = -W / 2; x <= W / 2 + 1e-3; x += ft(8)) {
            s.add([x, yr + rail / 2, zf], [ft(0.25), rail, ft(0.25)]);
        }
        s.beam([-W / 2, yr + rail, zf], [W / 2, yr + rail, zf], ft(0.3));
        s.beam(
            [-W / 2, yr + rail * 0.5, zf],
            [W / 2, yr + rail * 0.5, zf],
            ft(0.2),
        );
        for (const sx of [-1, 1]) {
            const x = (sx * W) / 2;
            s.beam([x, yr + rail, zf], [x, yr + rail, zr], ft(0.3));
            s.add([x, yr + rail / 2, zr], [ft(0.25), rail, ft(0.25)]);
        }
        for (const x of [-W * 0.18, W * 0.12]) {
            s.add([x, yr + ft(2.5), zf + ft(2)], [ft(0.3), ft(5), ft(0.3)]);
            props.add(
                [x, yr + ft(5.3), zf + ft(2)],
                [ft(1.6), ft(1), ft(0.9)],
                [0, 0, 0],
                0x2a2c31,
            );
        }
        const units = Math.max(2, Math.round(W / 14));
        for (let i = 0; i < units; i++) {
            props.add(
                [
                    -W / 2 + ((i + 0.5) * W) / units,
                    yr + ft(1.4),
                    zb + depth - ft(3.5),
                ],
                [ft(5), ft(2.6), ft(3.5)],
                [0, 0, 0],
                0x9a9da2,
            );
        }

        // Stair tower at the side-2 end, from the ground to the floor.
        const flight = ft(6);
        const sw = ft(4);
        const xs = W / 2 + ft(1) + sw / 2;
        const run = Math.min(depth - ft(1), ft(12));
        const z0 = zb + (depth - run) / 2;
        const flights = Math.max(1, Math.ceil(y0 / flight));
        const rise = y0 / flights;
        for (let k = 0; k < flights; k++) {
            const ya = k * rise;
            const yb = ya + rise;
            const forward = k % 2 === 0;
            const za = forward ? z0 : z0 + run;
            const zc = forward ? z0 + run : z0;
            const x = xs + (forward ? -sw / 4 : sw / 4);
            s.beam([x, ya, za], [x, yb, zc], ft(0.4));
            const len = Math.hypot(run, rise);
            const pitch = Math.atan2(rise, run) * (forward ? -1 : 1);
            s.add(
                [x, (ya + yb) / 2, (za + zc) / 2],
                [sw / 2, ft(0.15), len],
                [pitch, 0, 0],
            );
            s.add([xs, yb, zc], [sw, ft(0.25), ft(3)]);
        }
        for (const dx of [-sw / 2, sw / 2]) {
            for (const z of [z0, z0 + run]) {
                s.add(
                    [xs + dx, (y0 + rail) / 2, z],
                    [ft(0.35), y0 + rail, ft(0.35)],
                );
            }
        }
    }

    return {
        group,
        eye: [0, y0 + storyH * (stories - 1 + 0.55), zb - ft(2)],
        setGlow(k) {
            mat.emissiveIntensity = k;
        },
        dispose() {
            geo.dispose();
            mat.dispose();
            tex.map.dispose();
            tex.emissive.dispose();
        },
    };
}
