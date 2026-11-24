import {
    BufferGeometry,
    DoubleSide,
    Float32BufferAttribute,
    Mesh,
    MeshStandardMaterial,
    type CanvasTexture,
} from "three";
import { paintCanvasTexture } from "../../environment";
import { FLAGS, flagLeft } from "./roofPlan";

/**
 * The flags of nations WGI hangs on the back side: two rows of eight, long
 * side down. The designs are made up: plain bands, crosses and discs in
 * flag colors, so the rows read as flags without being any country's.
 */

type Design =
    | { kind: "bands"; colors: string[]; across?: boolean }
    | { kind: "cross"; field: string; cross: string }
    | { kind: "disc"; field: string; disc: string }
    | { kind: "canton"; field: string; canton: string; stripe: string }
    | { kind: "wedge"; field: string; wedge: string; band: string };

const RED = "#c8242e";
const BLUE = "#1d3f94";
const SKY = "#5aa7e0";
const GREEN = "#1f8a4c";
const GOLD = "#f2c230";
const WHITE = "#f1f0ea";
const INK = "#1b1b1f";
const ORANGE = "#e8772a";

export const FLAG_DESIGNS: Design[] = [
    { kind: "canton", field: WHITE, canton: BLUE, stripe: RED },
    { kind: "disc", field: GREEN, disc: GOLD },
    { kind: "bands", colors: [RED, WHITE, RED] },
    { kind: "bands", colors: [RED, GOLD], across: true },
    { kind: "bands", colors: [GOLD, BLUE, RED], across: true },
    { kind: "cross", field: SKY, cross: WHITE },
    { kind: "bands", colors: [SKY, WHITE, SKY], across: true },
    { kind: "wedge", field: WHITE, wedge: RED, band: BLUE },
    { kind: "disc", field: WHITE, disc: RED },
    { kind: "bands", colors: [BLUE, WHITE, RED] },
    { kind: "cross", field: RED, cross: GOLD },
    { kind: "bands", colors: [GREEN, WHITE, ORANGE] },
    { kind: "wedge", field: GOLD, wedge: INK, band: GREEN },
    { kind: "bands", colors: [INK, RED, GOLD], across: true },
    { kind: "disc", field: BLUE, disc: WHITE },
    { kind: "canton", field: RED, canton: WHITE, stripe: BLUE },
];

/** Atlas cell: one flag, hung long side down. */
const CELL = { w: 64, h: 128 };

function paintFlag(
    g: CanvasRenderingContext2D,
    d: Design,
    w: number,
    h: number,
): void {
    switch (d.kind) {
        case "bands": {
            const n = d.colors.length;
            d.colors.forEach((color, i) => {
                g.fillStyle = color;
                if (d.across) g.fillRect(0, (i * h) / n, w, h / n + 1);
                else g.fillRect((i * w) / n, 0, w / n + 1, h);
            });
            return;
        }
        case "cross":
            g.fillStyle = d.field;
            g.fillRect(0, 0, w, h);
            g.fillStyle = d.cross;
            g.fillRect(0, h * 0.3, w, h * 0.12);
            g.fillRect(w * 0.4, 0, w * 0.2, h);
            return;
        case "disc":
            g.fillStyle = d.field;
            g.fillRect(0, 0, w, h);
            g.fillStyle = d.disc;
            g.beginPath();
            g.arc(w / 2, h * 0.46, w * 0.28, 0, Math.PI * 2);
            g.fill();
            return;
        case "canton":
            g.fillStyle = d.field;
            g.fillRect(0, 0, w, h);
            g.fillStyle = d.stripe;
            for (let i = 0; i < 4; i++)
                g.fillRect(w * (0.07 + i * 0.25), 0, w * 0.11, h);
            g.fillStyle = d.canton;
            g.fillRect(0, 0, w * 0.56, h * 0.4);
            return;
        case "wedge":
            g.fillStyle = d.field;
            g.fillRect(0, 0, w, h);
            g.fillStyle = d.band;
            g.fillRect(0, h * 0.66, w, h * 0.34);
            g.fillStyle = d.wedge;
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(w, 0);
            g.lineTo(w / 2, h * 0.42);
            g.closePath();
            g.fill();
            return;
    }
}

function flagAtlas(): CanvasTexture {
    const n = FLAG_DESIGNS.length;
    return paintCanvasTexture(CELL.w * n, CELL.h, (g) => {
        FLAG_DESIGNS.forEach((design, i) => {
            g.save();
            g.translate(i * CELL.w, 0);
            g.beginPath();
            g.rect(0, 0, CELL.w, CELL.h);
            g.clip();
            paintFlag(g, design, CELL.w, CELL.h);
            g.restore();
        });
    });
}

export interface NightpoundFlags {
    mesh: Mesh;
    dispose(): void;
}

/** All sixteen flags as one mesh: one quad each, seen from both sides. */
export function buildFlags(): NightpoundFlags {
    const pos: number[] = [];
    const uv: number[] = [];
    const n = FLAGS.count;
    const y1 = FLAGS.topY;
    const y0 = y1 - FLAGS.height;
    for (let i = 0; i < n; i++) {
        const x0 = flagLeft(i);
        const x1 = x0 + FLAGS.width;
        // A hair of texture is kept back from each edge, so a flag never
        // picks up its neighbor's color.
        const u0 = (i + 0.02) / n;
        const u1 = (i + 0.98) / n;
        const z = FLAGS.z;
        pos.push(
            x0,
            y0,
            z,
            x1,
            y0,
            z,
            x1,
            y1,
            z,
            x0,
            y0,
            z,
            x1,
            y1,
            z,
            x0,
            y1,
            z,
        );
        uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    const map = flagAtlas();
    // Cloth under the house lights: mostly lit by the hall, with a little of
    // its own so the colors hold against the black steel behind.
    const material = new MeshStandardMaterial({
        map,
        emissive: 0xffffff,
        emissiveMap: map,
        emissiveIntensity: 0.22,
        roughness: 0.9,
        side: DoubleSide,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = "nightpound.flags";
    return {
        mesh,
        dispose() {
            geometry.dispose();
            map.dispose();
            material.dispose();
        },
    };
}
