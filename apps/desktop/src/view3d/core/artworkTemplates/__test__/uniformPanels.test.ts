// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BODY_TYPES } from "../../marchers/looks";
import {
    MEDIAN_V4U_PANELS,
    UNIFORM_PART_IDS,
    type UniformSide,
} from "../uniformPanels";

const BODIES = path.resolve(__dirname, "../../../assets/om-pose/bodies");

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC3: 3 };

interface Accessor {
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
}

/** The body's first primitive's `_PART` and rest-pose POSITION per vertex. */
function readBody(file: string): { part: number[]; pos: number[][] } {
    const glb = fs.readFileSync(file);
    const jsonLength = glb.readUInt32LE(12);
    const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
    const bin = 20 + jsonLength + 8;
    const read = (index: number): number[][] => {
        const a: Accessor = json.accessors[index];
        expect(a.componentType).toBe(5126); // float
        const view = json.bufferViews[a.bufferView];
        const n = COMPONENTS[a.type];
        const stride = view.byteStride ?? n * 4;
        const start = bin + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
        return Array.from({ length: a.count }, (_, k) =>
            Array.from({ length: n }, (_, c) =>
                glb.readFloatLE(start + k * stride + c * 4),
            ),
        );
    };
    const attributes = json.meshes[0].primitives[0].attributes;
    return {
        part: read(attributes._PART).map((v) => Math.round(v[0])),
        pos: read(attributes.POSITION),
    };
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[(sorted.length - 1) / 2];
}

describe("MEDIAN_V4U_PANELS", () => {
    const bodies = BODY_TYPES.map((type) =>
        readBody(path.join(BODIES, `${type}.glb`)),
    );

    function panel(
        body: { part: number[]; pos: number[][] },
        partId: number,
        side: UniformSide,
    ) {
        const xs: number[] = [];
        const ys: number[] = [];
        body.pos.forEach(([x, y, z], i) => {
            if (body.part[i] !== partId) return;
            const front = z >= 0;
            if (front !== (side === "front")) return;
            xs.push(x);
            ys.push(y);
        });
        return {
            count: xs.length,
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
        };
    }

    it("reads all seven bodies", () => {
        expect(bodies).toHaveLength(7);
    });

    it("matches the median of the seven bodies, to the millimeter", () => {
        for (const p of MEDIAN_V4U_PANELS) {
            const measured = bodies.map((b) =>
                panel(b, UNIFORM_PART_IDS[p.part], p.side),
            );
            const width = median(measured.map((m) => m.width));
            const height = median(measured.map((m) => m.height));
            expect(p.width.m, `${p.part} ${p.side} width`).toBe(
                Math.round(width * 1000) / 1000,
            );
            expect(p.height.m, `${p.part} ${p.side} height`).toBe(
                Math.round(height * 1000) / 1000,
            );
        }
    });

    it("lists every side a part has vertices on", () => {
        for (const [part, id] of Object.entries(UNIFORM_PART_IDS))
            for (const side of ["front", "back"] as const) {
                const has = bodies.some((b) => panel(b, id, side).count > 0);
                const listed = MEDIAN_V4U_PANELS.some(
                    (p) => p.part === part && p.side === side,
                );
                expect(listed, `${part} ${side}`).toBe(has);
            }
    });
});
