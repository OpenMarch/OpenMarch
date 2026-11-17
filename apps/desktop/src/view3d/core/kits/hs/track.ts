// cspell:ignore metalness
import {
    CylinderGeometry,
    DoubleSide,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    Quaternion,
    Vector2,
    Vector3,
    type BufferGeometry,
    type Object3D,
} from "three";
import { ft, GROUND_LAYER, setGroundLayer } from "../../environment";
import type { Frame } from "../stands";
import { mergeGeometries, QuadBuilder } from "./geometry";
import {
    chainLinkTexture,
    FENCE_TILE,
    finishTexture,
    TRACK_TILE,
    trackTexture,
} from "./textures";

/**
 * The track oval, the chain-link fence around it and the goal posts. All are
 * placed from the field frame.
 */

export interface Built {
    objects: Object3D[];
    dispose(): void;
}

export const TRACK_INNER_GAP = ft(15);
export const TRACK_WIDTH = ft(30);
export const TRACK_LANES = 6;
const TRACK_Y = 0.015;
const DECAL_Y = 0.02;

/** Track geometry: straight half length and the inner and outer radii. */
export function trackShape(f: Frame): {
    straight: number;
    inner: number;
    outer: number;
} {
    const straight = Math.max(f.halfW - ft(30), ft(30));
    const inner = f.halfD + TRACK_INNER_GAP;
    return { straight, inner, outer: inner + TRACK_WIDTH };
}

/**
 * Point on a stadium outline at parameter `t` in [0, 1), starting at the side-1
 * end of the back straight. World x, z.
 */
export function stadiumAt(
    cx: number,
    cz: number,
    straight: number,
    r: number,
    t: number,
): Vector2 {
    const L = 2 * straight;
    const arc = Math.PI * r;
    const total = 2 * L + 2 * arc;
    let s = (((t % 1) + 1) % 1) * total;
    if (s < L) return new Vector2(cx - straight + s, cz - r);
    s -= L;
    if (s < arc) {
        const a = -Math.PI / 2 + (s / arc) * Math.PI;
        return new Vector2(
            cx + straight + r * Math.cos(a),
            cz + r * Math.sin(a),
        );
    }
    s -= arc;
    if (s < L) return new Vector2(cx + straight - s, cz + r);
    s -= L;
    const a = Math.PI / 2 + (s / arc) * Math.PI;
    return new Vector2(cx - straight + r * Math.cos(a), cz + r * Math.sin(a));
}

/** Parameter samples: straights every `step` meters, arcs in `nArc` pieces. */
function samples(
    straight: number,
    r: number,
    step: number,
    nArc: number,
): number[] {
    const L = 2 * straight;
    const arc = Math.PI * r;
    const total = 2 * L + 2 * arc;
    const out: number[] = [];
    const nStraight = Math.max(1, Math.ceil(L / step));
    const push = (s: number) => out.push(s / total);
    for (let i = 0; i < nStraight; i++) push((L * i) / nStraight);
    for (let i = 0; i < nArc; i++) push(L + (arc * i) / nArc);
    for (let i = 0; i < nStraight; i++) push(L + arc + (L * i) / nStraight);
    for (let i = 0; i < nArc; i++) push(2 * L + arc + (arc * i) / nArc);
    return out;
}

/** The six-lane track as one textured ribbon, plus a finish line decal. */
export function buildTrackRibbon(f: Frame, high: boolean): Built {
    const { straight, inner, outer } = trackShape(f);
    const q = new QuadBuilder();
    const ts = samples(straight, inner, high ? 6 : 100, high ? 48 : 24);
    const mid = (inner + outer) / 2;
    const total = 4 * straight + 2 * Math.PI * mid;
    const up = new Vector3(0, 1, 0);
    for (let i = 0; i < ts.length; i++) {
        const t0 = ts[i];
        const t1 = i + 1 < ts.length ? ts[i + 1] : 1;
        const a0 = stadiumAt(f.cx, f.cz, straight, inner, t0);
        const a1 = stadiumAt(f.cx, f.cz, straight, inner, t1);
        const b0 = stadiumAt(f.cx, f.cz, straight, outer, t0);
        const b1 = stadiumAt(f.cx, f.cz, straight, outer, t1);
        const u0 = (t0 * total) / TRACK_TILE;
        const u1 = (t1 * total) / TRACK_TILE;
        q.quad(
            new Vector3(a0.x, TRACK_Y, a0.y),
            new Vector3(a1.x, TRACK_Y, a1.y),
            new Vector3(b1.x, TRACK_Y, b1.y),
            new Vector3(b0.x, TRACK_Y, b0.y),
            [u0, 0],
            [u1, 0],
            [u1, 1],
            [u0, 1],
            undefined,
            up,
        );
    }
    const geometry = q.build();
    const map = trackTexture(TRACK_LANES);
    const material = setGroundLayer(
        new MeshStandardMaterial({ map, roughness: 0.92 }),
        GROUND_LAYER.track,
    );
    const track = new Mesh(geometry, material);
    track.name = "track";
    track.receiveShadow = true;
    const objects: Object3D[] = [track];
    const owned: { dispose(): void }[] = [geometry, map, material];
    if (high) {
        const finishMap = finishTexture(TRACK_LANES);
        const finishMat = new MeshStandardMaterial({
            map: finishMap,
            transparent: true,
            roughness: 0.9,
            depthWrite: false,
        });
        setGroundLayer(finishMat, GROUND_LAYER.decal);
        const finishGeo = new PlaneGeometry(3.2, TRACK_WIDTH);
        const finish = new Mesh(finishGeo, finishMat);
        finish.name = "finishLine";
        finish.rotation.x = -Math.PI / 2;
        finish.position.set(
            f.cx + straight - 1.6,
            DECAL_Y,
            f.cz + (inner + outer) / 2,
        );
        finish.receiveShadow = true;
        objects.push(finish);
        owned.push(finishMap, finishMat, finishGeo);
    }
    return {
        objects,
        dispose() {
            owned.forEach((o) => o.dispose());
        },
    };
}

/**
 * Chain-link fence a meter outside the track, 1.22 m tall, with a gate at the
 * center of each straight so the band can march on.
 */
export function buildFence(f: Frame, gate = 4.5): Built {
    const { straight, outer } = trackShape(f);
    const r = outer + 1;
    const h = 1.22;
    const q = new QuadBuilder();
    const ts = samples(straight, r, 3, 48);
    const total = 4 * straight + 2 * Math.PI * r;
    for (let i = 0; i < ts.length; i++) {
        const t0 = ts[i];
        const t1 = i + 1 < ts.length ? ts[i + 1] : 1;
        const a = stadiumAt(f.cx, f.cz, straight, r, t0);
        const b = stadiumAt(f.cx, f.cz, straight, r, t1);
        const mx = (a.x + b.x) / 2;
        const onStraight =
            Math.abs(a.y - b.y) < 1e-6 &&
            Math.abs(Math.abs(a.y - f.cz) - r) < 1e-6;
        if (onStraight && Math.abs(mx - f.cx) < gate) continue;
        const u0 = (t0 * total) / FENCE_TILE;
        const u1 = (t1 * total) / FENCE_TILE;
        q.quad(
            new Vector3(a.x, 0, a.y),
            new Vector3(b.x, 0, b.y),
            new Vector3(b.x, h, b.y),
            new Vector3(a.x, h, a.y),
            [u0, 0],
            [u1, 0],
            [u1, 1],
            [u0, 1],
        );
    }
    const geometry = q.build();
    const map = chainLinkTexture();
    const material = new MeshStandardMaterial({
        map,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        metalness: 0.4,
        roughness: 0.5,
        alphaTest: 0.01,
    });
    const fence = new Mesh(geometry, material);
    fence.name = "fence";
    return {
        objects: [fence],
        dispose() {
            geometry.dispose();
            map.dispose();
            material.dispose();
        },
    };
}

/** High school goal posts: 23 ft 4 in wide, 10 ft crossbar, slingshot base. */
export function buildGoalPosts(f: Frame): Built | null {
    // Only for football-length surfaces.
    if (f.halfW * 2 < 95) return null;
    const yellow = 0xe0b92c;
    const pad = 0x3b3e45;
    const parts: {
        geometry: BufferGeometry;
        matrix?: Matrix4;
        tint?: number;
    }[] = [];
    const cyl = (radius: number, from: Vector3, to: Vector3, tint: number) => {
        const dir = to.clone().sub(from);
        const len = dir.length();
        const geo = new CylinderGeometry(radius, radius, len, 8, 1, false);
        const m = new Matrix4().compose(
            from.clone().add(to).multiplyScalar(0.5),
            new Quaternion().setFromUnitVectors(
                new Vector3(0, 1, 0),
                dir.normalize(),
            ),
            new Vector3(1, 1, 1),
        );
        parts.push({ geometry: geo, matrix: m, tint });
    };
    const crossY = 3.05;
    const half = 7.11 / 2;
    const upright = 6.1;
    for (const sx of [-1, 1]) {
        const xEnd = sx > 0 ? f.maxX : f.minX;
        const xBase = xEnd + sx * 1.83;
        const z = f.cz;
        const v = (x: number, y: number, zz: number) => new Vector3(x, y, zz);
        cyl(0.12, v(xBase, 0, z), v(xBase, crossY - 0.6, z), yellow);
        cyl(0.11, v(xBase, crossY - 0.6, z), v(xEnd, crossY, z), yellow);
        cyl(0.08, v(xEnd, crossY, z - half), v(xEnd, crossY, z + half), yellow);
        for (const sz of [-1, 1]) {
            cyl(
                0.06,
                v(xEnd, crossY, z + sz * half),
                v(xEnd, crossY + upright, z + sz * half),
                yellow,
            );
        }
        cyl(0.3, v(xBase, 0, z), v(xBase, 1.9, z), pad);
    }
    const geometry = mergeGeometries(parts, true);
    const material = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.5,
        metalness: 0.1,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = "goalPosts";
    mesh.castShadow = true;
    return {
        objects: [mesh],
        dispose() {
            geometry.dispose();
            material.dispose();
        },
    };
}
