// cspell:ignore superframe superframes
import {
    BufferGeometry,
    Float32BufferAttribute,
    Mesh,
    MeshStandardMaterial,
    type Vector3Tuple,
} from "three";
import {
    dieselTexture,
    paintRafterBanner,
    RAFTER_BANNER_ASPECT,
    RAFTER_BANNERS,
} from "./brand";
import type { DieselCtx, DieselFrame, DieselPart } from "./frame";

/**
 * The championship banners in the rafters of the Mark Diesel kit, in
 * kit-root space: a row under each of the two inner transverse trusses, in
 * the plane of the truss, so they face the two ends of the field. Each is
 * printed on both sides; all of them are one mesh on one atlas.
 */
export const DIESEL_RAFTER = {
    perTruss: 7,
    /**
     * Meters between banners along the truss. The chord steps down toward
     * the superframes, so this and the height keep the outermost banners'
     * hems clear of the light row.
     */
    spacing: 10,
    height: 7,
    width: 7 * RAFTER_BANNER_ASPECT,
    /** How far under the truss's bottom chord the pole hangs. */
    drop: 0.5,
    /**
     * Half the gap between a banner's two faces. Wider than the roof's own
     * pass-1 banners, which hang in the same place until they are removed.
     */
    faceGap: 0.12,
} as const;

/** Atlas cell size, pixels: one banner. */
const CELL = { width: 256, height: 640 };

/**
 * Height of the bottom chord of a transverse truss at `z` (as `roof.ts`):
 * peaked, parallel to the gable, so a row of banners steps down from the
 * ridge toward each superframe.
 */
export function transverseChordBottom(
    frame: Pick<DieselFrame, "ROOF" | "BUILDING">,
    z: number,
): number {
    return frame.ROOF.transverse.bottomY(z);
}

/** Where each banner hangs: the middle of its top edge, and its design. */
export function rafterBannerLayout(
    frame: Pick<DieselFrame, "ROOF" | "BUILDING">,
): { top: Vector3Tuple; design: number }[] {
    const { perTruss, spacing, drop } = DIESEL_RAFTER;
    const xs = frame.ROOF.transverse.xs;
    const out: { top: Vector3Tuple; design: number }[] = [];
    [xs[1], xs[3]].forEach((x, truss) => {
        for (let i = 0; i < perTruss; i++) {
            const z = (i - (perTruss - 1) / 2) * spacing;
            out.push({
                top: [x, transverseChordBottom(frame, z) - drop, z],
                // The second truss starts mid-list, so the two rows differ.
                design: (i + truss * 3) % RAFTER_BANNERS.length,
            });
        }
    });
    return out;
}

export function buildDieselRafterBanners(ctx: DieselCtx): DieselPart {
    const { width, height, faceGap } = DIESEL_RAFTER;
    const designs = RAFTER_BANNERS.length;
    const map = dieselTexture(CELL.width * designs, CELL.height, (g) => {
        RAFTER_BANNERS.forEach((banner, i) => {
            g.save();
            g.translate(i * CELL.width, 0);
            paintRafterBanner(g, banner, CELL.width, CELL.height);
            g.restore();
        });
    });
    const pos: number[] = [];
    const uv: number[] = [];
    for (const { top, design } of rafterBannerLayout(ctx.frame)) {
        const [x, y, z] = top;
        const u0 = design / designs;
        const u1 = (design + 1) / designs;
        // One face toward each end of the field, each reading left to right.
        for (const face of [1, -1]) {
            const fx = x + face * faceGap;
            const left = z + (face * width) / 2;
            const right = z - (face * width) / 2;
            pos.push(fx, y - height, left, fx, y - height, right, fx, y, right);
            pos.push(fx, y - height, left, fx, y, right, fx, y, left);
            uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
        }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    // Cloth in the dark of the roof: lit by the hall, with a little glow so
    // the print can be read from the seats, as it can in the building.
    const material = new MeshStandardMaterial({
        map,
        roughness: 0.9,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 0.1,
    });
    const object = new Mesh(geometry, material);
    object.name = "markDiesel.rafterBanners";
    return {
        object,
        setLighting() {},
        dispose() {
            geometry.dispose();
            map.dispose();
            material.dispose();
        },
    };
}
