import {
    Color,
    IcosahedronGeometry,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    Quaternion,
    Vector3,
    type CanvasTexture,
    type Object3D,
} from "three";
import {
    createRng,
    GROUND_LAYER,
    paintCanvasTexture,
    setGroundLayer,
} from "../../environment";
import type { Frame } from "../stands";
import type { Extents, Gate } from "./exterior";

/**
 * The ground around the college stadium: one painted square (lawn, paved
 * plaza, a perimeter road, parking and walks) whose edge fades into whatever
 * ground is below it, a matching night map, and clumps of trees.
 */

const SITE_Y = -0.03;
/** Lawn between the plaza's edge and the road. */
const PLAZA_MARGIN = 14;
const ROAD_GAP = 48;
const ROAD_W = 9;
const LOT_DEPTH = 58;
const TEX = 2048;
const NIGHT_TEX = 1024;

interface Rect {
    x0: number;
    z0: number;
    x1: number;
    z1: number;
}

interface Layout {
    size: number;
    cx: number;
    cz: number;
    plaza: Rect;
    road: Rect;
    lots: Rect[];
    gates: Gate[];
}

function layoutFor(f: Frame, e: Extents, openX: number, gates: Gate[]): Layout {
    const plaza: Rect = {
        x0: openX - 20,
        x1: e.end + PLAZA_MARGIN,
        z0: e.back - PLAZA_MARGIN,
        z1: e.front + PLAZA_MARGIN,
    };
    const road: Rect = {
        x0: plaza.x0 - ROAD_GAP,
        x1: plaza.x1 + ROAD_GAP,
        z0: plaza.z0 - ROAD_GAP,
        z1: plaza.z1 + ROAD_GAP,
    };
    const lotW = Math.min(240, plaza.x1 - plaza.x0);
    const lot = (zNear: number, dir: 1 | -1): Rect => {
        const z2 = zNear + dir * LOT_DEPTH;
        return {
            x0: f.cx - lotW / 2,
            x1: f.cx + lotW / 2,
            z0: Math.min(zNear, z2),
            z1: Math.max(zNear, z2),
        };
    };
    const lots = [lot(road.z1 + 6, 1), lot(road.z0 - 6, -1)];
    const reach = Math.max(
        road.x1 - f.cx,
        f.cx - road.x0,
        lots[0].z1 - f.cz,
        f.cz - lots[1].z0,
    );
    return {
        size: 2 * (reach + 60),
        cx: f.cx,
        cz: f.cz,
        plaza,
        road,
        lots,
        gates,
    };
}

/** Maps world meters to canvas pixels for a `px` wide canvas. */
function painter(l: Layout, px: number) {
    const k = px / l.size;
    const X = (x: number) => (x - (l.cx - l.size / 2)) * k;
    const Z = (z: number) => (z - (l.cz - l.size / 2)) * k;
    return { k, X, Z };
}

function paintLawn(g: CanvasRenderingContext2D, W: number, seed: number): void {
    g.fillStyle = "#5c6b47";
    g.fillRect(0, 0, W, W);
    const rnd = createRng(seed);
    for (let i = 0; i < 180; i++) {
        const r = 40 + rnd() * 180;
        const x = rnd() * W;
        const y = rnd() * W;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        const tone = rnd() < 0.5 ? "90,102,66" : "70,84,52";
        grad.addColorStop(0, `rgba(${tone},0.12)`);
        grad.addColorStop(1, `rgba(${tone},0)`);
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
}

function paintSite(
    g: CanvasRenderingContext2D,
    W: number,
    l: Layout,
    seed: number,
): void {
    const { k, X, Z } = painter(l, W);
    const rect = (r: Rect, css: string) => {
        g.fillStyle = css;
        g.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
    };
    paintLawn(g, W, seed);

    // Mown stripes across the lawn.
    g.fillStyle = "rgba(255,255,255,0.025)";
    for (let z = 0; z < W; z += 28 * k)
        if (Math.floor(z / (28 * k)) % 2 === 0) g.fillRect(0, z, W, 14 * k);

    // Perimeter road.
    rect(
        {
            x0: l.road.x0 - ROAD_W / 2,
            x1: l.road.x1 + ROAD_W / 2,
            z0: l.road.z0 - ROAD_W / 2,
            z1: l.road.z1 + ROAD_W / 2,
        },
        "#3a3a3b",
    );
    rect(
        {
            x0: l.road.x0 + ROAD_W / 2,
            x1: l.road.x1 - ROAD_W / 2,
            z0: l.road.z0 + ROAD_W / 2,
            z1: l.road.z1 - ROAD_W / 2,
        },
        "#5c6b47",
    );

    // Parking: two lots of stalls with a few cars.
    const rnd = createRng(seed + 1);
    for (const lot of l.lots) {
        rect(lot, "#46464a");
        g.strokeStyle = "rgba(220,216,205,0.45)";
        g.lineWidth = Math.max(1, 0.2 * k);
        const rowStep = 19;
        for (let z = lot.z0 + 6; z < lot.z1 - 3; z += rowStep) {
            for (let x = lot.x0 + 3; x < lot.x1 - 3; x += 2.7) {
                g.beginPath();
                g.moveTo(X(x), Z(z));
                g.lineTo(X(x), Z(z + 5.5));
                g.stroke();
                if (rnd() < 0.42) {
                    const c = 40 + Math.floor(rnd() * 150);
                    const t = rnd() * 16;
                    g.fillStyle = `rgb(${c + t},${c + t},${c + 8})`;
                    g.fillRect(X(x + 0.5), Z(z + 0.6), 1.8 * k, 4.5 * k);
                }
            }
        }
    }

    // Walks from each gate out to the road.
    g.fillStyle = "#8f897c";
    for (const w of l.gates) {
        const reachOut = w.nx
            ? Math.abs((w.nx > 0 ? l.road.x1 : l.road.x0) - w.x)
            : Math.abs((w.nz > 0 ? l.road.z1 : l.road.z0) - w.z);
        const hw = 7;
        if (w.nx) {
            const a = Math.min(w.x, w.x + w.nx * reachOut);
            g.fillRect(X(a), Z(w.z - hw), reachOut * k, 2 * hw * k);
        } else {
            const a = Math.min(w.z, w.z + w.nz * reachOut);
            g.fillRect(X(w.x - hw), Z(a), 2 * hw * k, reachOut * k);
        }
    }

    // The plaza: warm pavers around the building.
    rect(l.plaza, "#8f897c");
    g.strokeStyle = "rgba(70,65,56,0.32)";
    g.lineWidth = 1;
    const pw = l.plaza.x1 - l.plaza.x0;
    const pd = l.plaza.z1 - l.plaza.z0;
    for (let x = 0; x <= pw; x += 8) {
        g.beginPath();
        g.moveTo(X(l.plaza.x0 + x), Z(l.plaza.z0));
        g.lineTo(X(l.plaza.x0 + x), Z(l.plaza.z1));
        g.stroke();
    }
    for (let z = 0; z <= pd; z += 8) {
        g.beginPath();
        g.moveTo(X(l.plaza.x0), Z(l.plaza.z0 + z));
        g.lineTo(X(l.plaza.x1), Z(l.plaza.z0 + z));
        g.stroke();
    }
    // A thin brick edge, the plaza's one warm accent.
    g.strokeStyle = "#6e5242";
    g.lineWidth = Math.max(2, 0.9 * k);
    g.strokeRect(X(l.plaza.x0), Z(l.plaza.z0), pw * k, pd * k);

    // Fade the square's edge so it melts into the ground below.
    g.globalCompositeOperation = "destination-out";
    const fade = 44 * k;
    for (const [x0, y0, x1, y1] of [
        [0, 0, fade, 0],
        [W, 0, W - fade, 0],
        [0, 0, 0, fade],
        [0, W, 0, W - fade],
    ]) {
        const grad = g.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, W, W);
    }
    g.globalCompositeOperation = "source-over";
}

function paintNight(g: CanvasRenderingContext2D, W: number, l: Layout): void {
    const { k, X, Z } = painter(l, W);
    g.fillStyle = "#000000";
    g.fillRect(0, 0, W, W);
    const pool = (x: number, z: number, r: number, a: number) => {
        const R = r * k;
        const grad = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), R);
        grad.addColorStop(0, `rgba(255,196,130,${a})`);
        grad.addColorStop(1, "rgba(255,196,130,0)");
        g.fillStyle = grad;
        g.fillRect(X(x) - R, Z(z) - R, 2 * R, 2 * R);
    };
    // The plaza, faintly lit against the dark lawn.
    g.fillStyle = "rgba(120,86,52,0.13)";
    g.fillRect(
        X(l.plaza.x0),
        Z(l.plaza.z0),
        (l.plaza.x1 - l.plaza.x0) * k,
        (l.plaza.z1 - l.plaza.z0) * k,
    );
    for (const w of l.gates) {
        pool(w.x + w.nx * 12, w.z + w.nz * 12, 30, 0.7);
    }
    // Walk and road lights along the perimeter.
    const step = 22;
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
        const len = Math.hypot(x1 - x0, z1 - z0);
        for (let d = 0; d <= len; d += step) {
            const t = d / len;
            pool(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 11, 0.42);
        }
    };
    const r = l.road;
    edge(r.x0, r.z0, r.x1, r.z0);
    edge(r.x1, r.z0, r.x1, r.z1);
    edge(r.x1, r.z1, r.x0, r.z1);
    edge(r.x0, r.z1, r.x0, r.z0);
    for (const lot of l.lots) {
        for (let x = lot.x0 + 20; x < lot.x1; x += 40) {
            for (let z = lot.z0 + 14; z < lot.z1; z += 28) pool(x, z, 16, 0.32);
        }
    }
}

function keepsClear(x: number, z: number, l: Layout): boolean {
    const off = (r: Rect, m: number) =>
        x < r.x0 - m || x > r.x1 + m || z < r.z0 - m || z > r.z1 + m;
    if (!off(l.plaza, 6)) return false;
    // The road loop's own strip.
    const inRoad =
        !off(l.road, ROAD_W / 2 + 4) &&
        off(
            {
                x0: l.road.x0 + ROAD_W / 2 + 4,
                x1: l.road.x1 - ROAD_W / 2 - 4,
                z0: l.road.z0 + ROAD_W / 2 + 4,
                z1: l.road.z1 - ROAD_W / 2 - 4,
            },
            0,
        );
    if (inRoad) return false;
    if (!l.lots.every((lot) => off(lot, 5))) return false;
    for (const w of l.gates) {
        const clearWalk = w.nx
            ? Math.abs(z - w.z) > 12
            : Math.abs(x - w.x) > 12;
        if (!clearWalk) return false;
    }
    return true;
}

/** Clumps of low icosahedra, tinted in muted greens. */
function buildTrees(l: Layout, seed: number) {
    const per = 3;
    const target = 90;
    const rnd = createRng(seed);
    const clumps: [number, number][] = [];
    const span = l.size * 0.46;
    // A planted row along the plaza's edge, broken at the walks.
    const edgeRow = (x0: number, z0: number, x1: number, z1: number) => {
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 17));
        for (let i = 0; i <= n; i++) {
            const x = x0 + ((x1 - x0) * i) / n;
            const z = z0 + ((z1 - z0) * i) / n;
            if (keepsClear(x, z, l)) clumps.push([x, z]);
        }
    };
    const { x0, x1, z0, z1 } = l.plaza;
    const m0 = 9;
    edgeRow(x0 - m0, z1 + m0, x1 + m0, z1 + m0);
    edgeRow(x0 - m0, z0 - m0, x1 + m0, z0 - m0);
    edgeRow(x1 + m0, z0 - m0, x1 + m0, z1 + m0);
    edgeRow(x0 - m0, z0 - m0, x0 - m0, z1 + m0);
    for (
        let tries = 0;
        tries < target * 40 && clumps.length < target + 60;
        tries++
    ) {
        const x = l.cx + (rnd() * 2 - 1) * span;
        const z = l.cz + (rnd() * 2 - 1) * span;
        if (keepsClear(x, z, l)) clumps.push([x, z]);
    }
    const geo = new IcosahedronGeometry(1, 1);
    const mat = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.95,
        emissive: 0x5a6a48,
        emissiveIntensity: 0,
    });
    const mesh = new InstancedMesh(geo, mat, Math.max(1, clumps.length * per));
    mesh.name = "college.trees";
    mesh.castShadow = true;
    const m = new Matrix4();
    const q = new Quaternion();
    const c = new Color();
    clumps.forEach(([x, z], i) => {
        const h = 8 + rnd() * 5;
        for (let j = 0; j < per; j++) {
            const a = rnd() * Math.PI * 2;
            const r = 1.2 + rnd() * 2.6;
            const s = (2.6 + rnd() * 1.6) * (h / 10);
            m.compose(
                new Vector3(
                    x + Math.cos(a) * r,
                    h * (0.55 + rnd() * 0.3),
                    z + Math.sin(a) * r,
                ),
                q,
                new Vector3(s, s * 1.15, s),
            );
            mesh.setMatrixAt(i * per + j, m);
            c.setRGB(
                0.15 + rnd() * 0.06,
                0.22 + rnd() * 0.06,
                0.1 + rnd() * 0.04,
            );
            mesh.setColorAt(i * per + j, c);
        }
    });
    mesh.count = clumps.length * per;
    return { mesh, geo, mat };
}

export interface CollegeSite {
    objects: Object3D[];
    setNight(k: number): void;
    dispose(): void;
}

export function buildCollegeSite(
    f: Frame,
    extents: Extents,
    openX: number,
    gates: Gate[],
    high: boolean,
): CollegeSite {
    const layout = layoutFor(f, extents, openX, gates);
    const map: CanvasTexture = paintCanvasTexture(
        TEX,
        TEX,
        (g, w) => paintSite(g, w, layout, 71),
        { anisotropy: 8 },
    );
    const nightMap: CanvasTexture = paintCanvasTexture(
        NIGHT_TEX,
        NIGHT_TEX,
        (g, w) => paintNight(g, w, layout),
    );
    const mat = new MeshStandardMaterial({
        map,
        roughness: 1,
        transparent: true,
        emissive: 0xffffff,
        emissiveMap: nightMap,
        emissiveIntensity: 0,
    });
    setGroundLayer(mat, GROUND_LAYER.site);
    const geo = new PlaneGeometry(layout.size, layout.size);
    const site = new Mesh(geo, mat);
    site.name = "college.site";
    site.rotation.x = -Math.PI / 2;
    site.position.set(layout.cx, SITE_Y, layout.cz);
    site.receiveShadow = high;
    site.userData.ground = true;
    site.renderOrder = -1;

    const objects: Object3D[] = [site];
    const trees = high ? buildTrees(layout, 73) : undefined;
    if (trees) objects.push(trees.mesh);

    return {
        objects,
        setNight(k) {
            mat.emissiveIntensity = k;
            if (trees) trees.mat.emissiveIntensity = 0.16 * k;
        },
        dispose() {
            map.dispose();
            nightMap.dispose();
            mat.dispose();
            geo.dispose();
            if (trees) {
                trees.geo.dispose();
                trees.mat.dispose();
                trees.mesh.dispose();
            }
        },
    };
}
