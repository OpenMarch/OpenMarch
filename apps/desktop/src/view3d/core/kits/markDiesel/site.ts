import {
    BoxGeometry,
    BufferGeometry,
    Color,
    Float32BufferAttribute,
    Group,
    IcosahedronGeometry,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    Quaternion,
    Vector3,
    type Material,
} from "three";
import {
    createRng,
    ft,
    GROUND_LAYER,
    setFlushBacking,
    setGroundLayer,
} from "../../environment";
import { siteTextures } from "../pro/textures";
import { dieselMonumentTexture, MONUMENT_ASPECT } from "./brand";
import { dieselFacadeLayout } from "./facade";
import type { DieselCtx, DieselPart } from "./frame";
import { dieselLighting } from "./lighting";

/**
 * The grounds around the Mark Diesel kit: the plain ground everything stands
 * on, a paved plaza round the building with an avenue to each side's doors,
 * parking past it, trees along the plaza's edge, and an OpenMarch monument
 * sign beside each avenue (`dieselMonumentSpots`). The plan is the pro
 * kit's site texture on one plane; it is clear under the building and fades
 * out into the shared land. Kit-root space: the origin is the field center.
 *
 * The real building sits about 25 ft above its field (`BUILDING.streetY`).
 * The shared land is level with the field, so here the street is too.
 */

/** Plaza depth beyond the wall, meters. */
export const DIESEL_PLAZA_DEPTH = 26;
/** How far the painted site reaches past the long walls. */
const SITE_REACH = 130;
/** Above the shared land, which needs 2 cm of clearance. */
const SITE_Y = 0.02;
const GROUND_Y = -ft(0.3);
const GROUND_HALF = ft(4500);
const TREE_SPACING = 13;
/** Half the width kept clear of trees where an avenue crosses the plaza. */
const AVENUE_CLEAR = 15;

/** Where the plaza's trees stand, in kit-root x and z. */
export function dieselTreeSpots(
    halfX: number,
    halfZ: number,
): [number, number][] {
    const ex = halfX + DIESEL_PLAZA_DEPTH - 1.6;
    const ez = halfZ + DIESEL_PLAZA_DEPTH - 1.6;
    const out: [number, number][] = [];
    const row = (len: number, place: (m: number) => [number, number]) => {
        const n = Math.floor(len / TREE_SPACING);
        for (let i = -n; i <= n; i++) {
            const m = i * TREE_SPACING;
            if (Math.abs(m) >= AVENUE_CLEAR) out.push(place(m));
        }
    };
    row(ex - 4, (m) => [m, ez]);
    row(ex - 4, (m) => [m, -ez]);
    row(ez - 4, (m) => [ex, m]);
    row(ez - 4, (m) => [-ex, m]);
    // A double row down the north avenue, toward the town.
    for (let d = 14; d <= 92; d += TREE_SPACING)
        for (const sz of [-1, 1]) out.push([-(ex + d), sz * AVENUE_CLEAR]);
    return out;
}

/** A monument sign: where it stands and which way its front faces. */
export interface MonumentSpot {
    x: number;
    z: number;
    /** Turn about +Y from facing +Z; the front faces away from the building. */
    yaw: number;
}

/** The monument signs' limestone plinth and lit cabinet, meters. */
export const MONUMENT = {
    plinth: { width: 9.6, height: 1, depth: 1.4 },
    cabinet: { width: 9.2, depth: 0.8 },
    face: { width: 9 },
    /** From the plaza's outer edge back toward the wall. */
    inset: 6,
    /** Beside the avenue's centerline, clear of the walk and the trees. */
    aside: 10,
} as const;

/** One monument sign beside each avenue, facing the street. */
export function dieselMonumentSpots(
    halfX: number,
    halfZ: number,
): MonumentSpot[] {
    const out = DIESEL_PLAZA_DEPTH - MONUMENT.inset;
    const { aside } = MONUMENT;
    return [
        { x: aside, z: halfZ + out, yaw: 0 },
        { x: -aside, z: -(halfZ + out), yaw: Math.PI },
        { x: halfX + out, z: -aside, yaw: Math.PI / 2 },
        { x: -(halfX + out), z: aside, yaw: -Math.PI / 2 },
    ];
}

/**
 * The monument signs: one instanced mesh of plinths and cabinets, and one
 * mesh of printed faces, front and back, that glow a little by day and more
 * at night.
 */
function buildMonuments(spots: MonumentSpot[]) {
    const { plinth, cabinet, face } = MONUMENT;
    const faceH = face.width / MONUMENT_ASPECT;
    const cabinetH = faceH + 0.08;
    const boxes = new InstancedMesh(
        new BoxGeometry(1, 1, 1),
        // The faces lie on the cabinets: draw the cabinets behind them.
        setFlushBacking(
            new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
        ),
        spots.length * 2,
    );
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const stone = new Color(0xcdc3ab);
    const steel = new Color(0x1a1922);
    const pos: number[] = [];
    const normal: number[] = [];
    const uv: number[] = [];
    spots.forEach(({ x, z, yaw }, i) => {
        q.setFromAxisAngle(up, yaw);
        m.compose(
            new Vector3(x, plinth.height / 2, z),
            q,
            new Vector3(plinth.width, plinth.height, plinth.depth),
        );
        boxes.setMatrixAt(i * 2, m);
        boxes.setColorAt(i * 2, stone);
        m.compose(
            new Vector3(x, plinth.height + cabinetH / 2, z),
            q,
            new Vector3(cabinet.width, cabinetH, cabinet.depth),
        );
        boxes.setMatrixAt(i * 2 + 1, m);
        boxes.setColorAt(i * 2 + 1, steel);
        // Both faces, each read from its own side.
        const across = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        const front = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const cy = plinth.height + cabinetH / 2;
        for (const side of [1, -1]) {
            const n = front.clone().multiplyScalar(side);
            const right = across.clone().multiplyScalar(side);
            const c = new Vector3(x, cy, z).addScaledVector(
                n,
                cabinet.depth / 2 + 0.02,
            );
            const corner = (u: number, v: number) => {
                const p = c
                    .clone()
                    .addScaledVector(right, (u - 0.5) * face.width)
                    .setY(cy + (v - 0.5) * faceH);
                pos.push(p.x, p.y, p.z);
                normal.push(n.x, n.y, n.z);
                uv.push(u, v);
            };
            for (const [u, v] of [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
                [1, 1],
                [0, 1],
            ])
                corner(u, v);
        }
    });
    boxes.instanceMatrix.needsUpdate = true;
    if (boxes.instanceColor) boxes.instanceColor.needsUpdate = true;
    const faceGeo = new BufferGeometry();
    faceGeo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    faceGeo.setAttribute("normal", new Float32BufferAttribute(normal, 3));
    faceGeo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    const map = dieselMonumentTexture();
    const faceMat = new MeshStandardMaterial({
        map,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 0.3,
        roughness: 0.6,
    });
    return { boxes, faces: new Mesh(faceGeo, faceMat), faceMat, map };
}

/** The Mark Diesel kit's ground, plaza, trees and monument signs. */
export function buildDieselSite(ctx: DieselCtx): DieselPart {
    const { frame, quality } = ctx;
    const high = quality === "high";
    const l = dieselFacadeLayout(frame);
    const root = new Group();
    root.name = "diesel.site";
    const geometries: BufferGeometry[] = [];
    const materials: Material[] = [];
    const add = <T extends Mesh>(mesh: T, name: string): T => {
        mesh.name = name;
        // The grounds are far from the field and never shade it.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        geometries.push(mesh.geometry);
        root.add(mesh);
        return mesh;
    };
    const own = <M extends Material>(m: M): M => {
        materials.push(m);
        return m;
    };

    // The plain ground, as far as the fog. At high quality the shared land
    // and the painted site cover it; at low quality it is the asphalt, with
    // a paler plaza set into it round the building.
    const pos: number[] = [];
    const col: number[] = [];
    const rect = (
        x0: number,
        x1: number,
        z0: number,
        z1: number,
        y: number,
        hex: number,
    ) => {
        if (x1 <= x0 || z1 <= z0) return;
        const c = new Color(hex);
        pos.push(x0, y, z1, x1, y, z1, x1, y, z0);
        pos.push(x0, y, z1, x1, y, z0, x0, y, z0);
        for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
    };
    const g = GROUND_HALF;
    if (high) {
        rect(-g, g, -g, g, GROUND_Y, 0x55575c);
    } else {
        const px = l.halfX + DIESEL_PLAZA_DEPTH;
        const pz = l.halfZ + DIESEL_PLAZA_DEPTH;
        rect(-g, g, pz, g, GROUND_Y, 0x55575c);
        rect(-g, g, -g, -pz, GROUND_Y, 0x55575c);
        rect(-g, -px, -pz, pz, GROUND_Y, 0x55575c);
        rect(px, g, -pz, pz, GROUND_Y, 0x55575c);
        rect(-px, px, -pz, pz, GROUND_Y + ft(0.1), 0x7f7c75);
    }
    const groundGeo = new BufferGeometry();
    groundGeo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    groundGeo.setAttribute("color", new Float32BufferAttribute(col, 3));
    groundGeo.computeVertexNormals();
    const groundMat = own(
        setGroundLayer(
            new MeshStandardMaterial({
                color: 0xffffff,
                roughness: 1,
                vertexColors: true,
            }),
            GROUND_LAYER.ground,
        ),
    );
    add(new Mesh(groundGeo, groundMat), "diesel.ground");

    let siteMat: MeshStandardMaterial | null = null;
    let treeMat: MeshStandardMaterial | null = null;
    let trees: InstancedMesh | null = null;
    let monuments: ReturnType<typeof buildMonuments> | null = null;
    if (high) {
        const halfSize = Math.max(l.halfX, l.halfZ) + SITE_REACH;
        const textures = siteTextures({
            halfSize,
            rx: l.halfX,
            rz: l.halfZ,
            corner: l.corner,
            plaza: DIESEL_PLAZA_DEPTH,
        });
        siteMat = own(
            setGroundLayer(
                new MeshStandardMaterial({
                    map: textures.map,
                    emissive: 0xffffff,
                    emissiveMap: textures.emissive,
                    emissiveIntensity: 0,
                    roughness: 1,
                    transparent: true,
                    depthWrite: false,
                    alphaTest: 0.01,
                }),
                GROUND_LAYER.site,
            ),
        );
        const plane = add(
            new Mesh(new PlaneGeometry(2 * halfSize, 2 * halfSize), siteMat),
            "diesel.site.plan",
        );
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = SITE_Y;

        // Trees: two low blobs each, in one instanced mesh.
        const spots = dieselTreeSpots(l.halfX, l.halfZ);
        const rnd = createRng(89);
        treeMat = own(
            new MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.95,
                emissive: 0x5a6a48,
                emissiveIntensity: 0,
            }),
        );
        trees = add(
            new InstancedMesh(
                new IcosahedronGeometry(1, 0),
                treeMat,
                spots.length * 2,
            ),
            "diesel.site.trees",
        );
        const m = new Matrix4();
        const q = new Quaternion();
        const c = new Color();
        spots.forEach(([x, z], i) => {
            const h = 7 + rnd() * 4;
            for (let j = 0; j < 2; j++) {
                const s = (2.4 + rnd() * 1.2) * (h / 9);
                q.setFromAxisAngle(new Vector3(0, 1, 0), rnd() * Math.PI * 2);
                // The lower blob stands on the ground; the upper is the crown.
                m.compose(
                    new Vector3(
                        x + (rnd() - 0.5) * 2.2,
                        j === 0 ? s * 1.05 : h * 0.8,
                        z + (rnd() - 0.5) * 2.2,
                    ),
                    q,
                    new Vector3(s, s * 1.15, s),
                );
                trees!.setMatrixAt(i * 2 + j, m);
                c.setHSL(0.29 + rnd() * 0.05, 0.34, 0.11 + rnd() * 0.05);
                trees!.setColorAt(i * 2 + j, c);
            }
        });
        trees.instanceMatrix.needsUpdate = true;
        if (trees.instanceColor) trees.instanceColor.needsUpdate = true;

        monuments = buildMonuments(dieselMonumentSpots(l.halfX, l.halfZ));
        own(monuments.boxes.material as Material);
        own(monuments.faceMat);
        add(monuments.boxes, "diesel.site.monuments");
        add(monuments.faces, "diesel.site.monumentFaces");
    }

    return {
        object: root,
        setLighting(preset) {
            // 0 by day, 1 at night: the plaza's lamps come on with the town's.
            const dark = dieselLighting(preset).sky.windows;
            if (siteMat) siteMat.emissiveIntensity = dark;
            if (treeMat) treeMat.emissiveIntensity = 0.16 * dark;
            if (monuments)
                monuments.faceMat.emissiveIntensity = 0.3 + 0.7 * dark;
        },
        dispose() {
            geometries.forEach((geo) => geo.dispose());
            materials.forEach((mat) => mat.dispose());
            siteMat?.map?.dispose();
            siteMat?.emissiveMap?.dispose();
            trees?.dispose();
            monuments?.boxes.dispose();
            monuments?.map.dispose();
        },
    };
}
