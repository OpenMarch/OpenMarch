// @vitest-environment node
/**
 * Simplifying never deletes a part (#1169): a scaffold's thin poles collapsed to nothing in the
 * distant copy, because the simplifier's error is relative to each part's own size.
 */
import { describe, expect, it } from "vitest";
import { Document } from "@gltf-transform/core";
import { importModel, PART_TRIANGLE_FLOOR } from "../pipeline";
import { DISTANT_TRIANGLE_CAP } from "../rules";
import { primitiveTriangles } from "../sceneTriangles";
import { env, picked, readGlb, writeGlb } from "./fixtures";

/** A flat deck of `n` × `n` quads, `size` m across */
function deck(doc: Document, n: number, size: number) {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let z = 0; z <= n; z++)
        for (let x = 0; x <= n; x++)
            positions.push((x / n - 0.5) * size, 2, (z / n - 0.5) * size);
    for (let z = 0; z < n; z++)
        for (let x = 0; x < n; x++) {
            const a = z * (n + 1) + x;
            const b = a + n + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
    return primitive(doc, positions, indices);
}

/** An open cylinder `segments` around, 0.05 m across and 2 m tall, standing at x, z */
function pole(doc: Document, segments: number, x: number, z: number) {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const px = x + Math.cos(a) * 0.025;
        const pz = z + Math.sin(a) * 0.025;
        positions.push(px, 0, pz, px, 2, pz);
        const j = (i + 1) % segments;
        indices.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    }
    return primitive(doc, positions, indices);
}

function primitive(doc: Document, positions: number[], indices: number[]) {
    const buffer = doc.getRoot().listBuffers()[0];
    return doc
        .createPrimitive()
        .setAttribute(
            "POSITION",
            doc
                .createAccessor()
                .setType("VEC3")
                .setArray(new Float32Array(positions))
                .setBuffer(buffer),
        )
        .setIndices(
            doc
                .createAccessor()
                .setType("SCALAR")
                .setArray(new Uint32Array(indices))
                .setBuffer(buffer),
        );
}

const POLES = 16;

/** A 30,000-triangle deck on 16 thin poles, each its own mesh */
async function scaffold(): Promise<Uint8Array> {
    const doc = new Document();
    doc.createBuffer();
    const scene = doc.createScene();
    scene.addChild(
        doc
            .createNode("deck")
            .setMesh(doc.createMesh("deck").addPrimitive(deck(doc, 122, 4))),
    );
    for (let i = 0; i < POLES; i++)
        scene.addChild(
            doc
                .createNode(`pole ${i}`)
                .setMesh(
                    doc
                        .createMesh(`pole ${i}`)
                        .addPrimitive(
                            pole(
                                doc,
                                64,
                                (i % 4) - 1.5,
                                Math.floor(i / 4) - 1.5,
                            ),
                        ),
                ),
        );
    return writeGlb(doc);
}

/** `count` poles in rows, each its own mesh, and nothing else */
async function fence(count: number): Promise<Uint8Array> {
    const doc = new Document();
    doc.createBuffer();
    const scene = doc.createScene();
    for (let i = 0; i < count; i++)
        scene.addChild(
            doc
                .createNode(`post ${i}`)
                .setMesh(
                    doc
                        .createMesh(`post ${i}`)
                        .addPrimitive(
                            pole(
                                doc,
                                24,
                                (i % 20) * 0.2,
                                Math.floor(i / 20) * 0.2,
                            ),
                        ),
                ),
        );
    return writeGlb(doc);
}

/** A sphere `segments` around and `rings` high, `radius` m, at x, z */
function sphere(
    doc: Document,
    segments: number,
    rings: number,
    radius: number,
    x: number,
    z: number,
) {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let r = 0; r <= rings; r++)
        for (let i = 0; i <= segments; i++) {
            const phi = (r / rings) * Math.PI;
            const theta = (i / segments) * Math.PI * 2;
            positions.push(
                x + radius * Math.sin(phi) * Math.cos(theta),
                1 + radius * Math.cos(phi),
                z + radius * Math.sin(phi) * Math.sin(theta),
            );
        }
    for (let r = 0; r < rings; r++)
        for (let i = 0; i < segments; i++) {
            const a = r * (segments + 1) + i;
            const b = a + segments + 1;
            if (r > 0) indices.push(a, b, a + 1);
            if (r < rings - 1) indices.push(a + 1, b, b + 1);
        }
    return primitive(doc, positions, indices);
}

/** `count` small balls in rows, each its own mesh */
async function balls(count: number): Promise<Uint8Array> {
    const doc = new Document();
    doc.createBuffer();
    const scene = doc.createScene();
    for (let i = 0; i < count; i++)
        scene.addChild(
            doc
                .createNode(`ball ${i}`)
                .setMesh(
                    doc
                        .createMesh(`ball ${i}`)
                        .addPrimitive(
                            sphere(
                                doc,
                                10,
                                6,
                                0.1,
                                (i % 20) * 0.5,
                                Math.floor(i / 20) * 0.5,
                            ),
                        ),
                ),
        );
    return writeGlb(doc);
}

/** Every triangle's center, in the model's own frame (parts are merged since #1201) */
async function triangleCenters(glb: Uint8Array): Promise<[number, number][]> {
    const doc = await readGlb(glb);
    const centers: [number, number][] = [];
    for (const node of doc.getRoot().listNodes()) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        const m = node.getWorldMatrix();
        for (const prim of mesh.listPrimitives()) {
            const pos = prim.getAttribute("POSITION")!;
            const idx = prim.getIndices();
            const count = idx ? idx.getCount() : pos.getCount();
            const v: number[] = [0, 0, 0];
            for (let t = 0; t < count; t += 3) {
                let x = 0;
                let z = 0;
                for (let k = 0; k < 3; k++) {
                    pos.getElement(idx ? idx.getScalar(t + k) : t + k, v);
                    x += m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
                    z += m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
                }
                centers.push([x / 3, z / 3]);
            }
        }
    }
    return centers;
}

/**
 * The triangles of each part, found by where it stands: within `radius` of its spot, laid out as
 * the test file has it (the import centers the footprint on the origin)
 */
async function trianglesAt(
    glb: Uint8Array,
    spots: [number, number][],
    radius: number,
): Promise<number[]> {
    const centers = await triangleCenters(glb);
    const xs = spots.map((s) => s[0]);
    const zs = spots.map((s) => s[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    return spots.map(
        ([x, z]) =>
            centers.filter(
                ([px, pz]) => Math.hypot(px - (x - cx), pz - (z - cz)) < radius,
            ).length,
    );
}

/** The parts the 3D View draws: primitives, across every mesh */
async function partCount(glb: Uint8Array): Promise<number> {
    const doc = await readGlb(glb);
    return doc
        .getRoot()
        .listMeshes()
        .reduce((n, mesh) => n + mesh.listPrimitives().length, 0);
}

const poleSpots = (): [number, number][] =>
    Array.from({ length: POLES }, (_, i) => [
        (i % 4) - 1.5,
        Math.floor(i / 4) - 1.5,
    ]);
const fenceSpots = (count: number): [number, number][] =>
    Array.from({ length: count }, (_, i) => [
        (i % 20) * 0.2,
        Math.floor(i / 20) * 0.2,
    ]);
const ballSpots = (count: number): [number, number][] =>
    Array.from({ length: count }, (_, i) => [
        (i % 20) * 0.5,
        Math.floor(i / 20) * 0.5,
    ]);

describe("simplifying keeps every part", () => {
    it("keeps each thin pole in the Light model and in its distant copy", async () => {
        const result = await importModel(
            [picked("scaffold.glb", await scaffold())],
            {},
            env,
        );
        if (!result.ok)
            throw new Error(JSON.stringify(result.report.cantImport));
        for (const part of [
            result.model.parts.model,
            result.model.parts.distant,
        ]) {
            // A pole's triangles sit within its 0.025 m radius; the deck's lie between poles
            const poles = await trianglesAt(part, poleSpots(), 0.03);
            for (const triangles of poles)
                expect(triangles).toBeGreaterThanOrEqual(PART_TRIANGLE_FLOOR);
        }
        // …and the deck, the one big part, did the simplifying
        const distant = await triangleCenters(result.model.parts.distant);
        expect(distant.length).toBeLessThan(2_000 + POLES * 64 * 2);
    });

    it("still fits the distant copy's cap with more parts than it can give the floor each", async () => {
        // 400 posts of 48 triangles: 19,200 in all, 5 each in a 2,000-triangle copy
        const result = await importModel(
            [picked("fence.glb", await fence(400))],
            {},
            env,
        );
        if (!result.ok)
            throw new Error(JSON.stringify(result.report.cantImport));
        const distant = result.model.parts.distant;
        expect((await triangleCenters(distant)).length).toBeLessThanOrEqual(
            DISTANT_TRIANGLE_CAP,
        );
        const posts = await trianglesAt(distant, fenceSpots(400), 0.06);
        expect(Math.min(...posts)).toBeGreaterThan(0);
    });

    it("simplifies a model of many small parts by the whole model's measure in its distant copy (#1180)", async () => {
        // 200 balls of 100 triangles: each is small beside the model, so its distant copy can
        // lose most of each ball's detail without the model changing shape
        const result = await importModel(
            [picked("balls.glb", await balls(200))],
            {},
            env,
        );
        if (!result.ok)
            throw new Error(JSON.stringify(result.report.cantImport));
        const distant = result.model.parts.distant;
        expect((await triangleCenters(distant)).length).toBeLessThanOrEqual(
            DISTANT_TRIANGLE_CAP * 1.5,
        );
        const each = await trianglesAt(distant, ballSpots(200), 0.15);
        expect(Math.min(...each)).toBeGreaterThan(0);
    });

    it("never leaves a part empty, however many parts share the cap", async () => {
        // A triangle or two each in the distant copy: the simplifier's count is a ceiling, and an
        // empty part would make the copy invalid glTF
        const result = await importModel(
            [picked("fence.glb", await fence(1_500))],
            {},
            env,
        );
        if (!result.ok)
            throw new Error(JSON.stringify(result.report.cantImport));
        for (const part of [
            result.model.parts.model,
            result.model.parts.distant,
        ]) {
            const posts = await trianglesAt(part, fenceSpots(1_500), 0.06);
            expect(Math.min(...posts)).toBeGreaterThan(0);
        }
    }, 60_000);
});

describe("merging parts (#1201)", () => {
    it("draws a model of many parts and one material as one part, in every copy", async () => {
        const result = await importModel(
            [picked("scaffold.glb", await scaffold())],
            { detail: "original" },
            env,
        );
        if (!result.ok)
            throw new Error(JSON.stringify(result.report.cantImport));
        const { model, light, distant } = result.model.parts;
        for (const part of [model, light!, distant])
            expect(await partCount(part)).toBe(1);
        // Merging moves no triangle: each pole's 128 still stand where it did (with a few of the
        // deck's above it)
        const poles = await trianglesAt(model, poleSpots(), 0.03);
        for (const triangles of poles)
            expect(triangles).toBeGreaterThanOrEqual(128);
    });
});
