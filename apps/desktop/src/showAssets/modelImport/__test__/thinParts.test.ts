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

/** Each mesh's triangles, by name */
async function partTriangles(glb: Uint8Array): Promise<Map<string, number>> {
    const doc = await readGlb(glb);
    return new Map(
        doc
            .getRoot()
            .listMeshes()
            .map((mesh) => [
                mesh.getName(),
                mesh
                    .listPrimitives()
                    .reduce((n, prim) => n + primitiveTriangles(prim), 0),
            ]),
    );
}

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
            const parts = await partTriangles(part);
            for (let i = 0; i < POLES; i++)
                expect(parts.get(`pole ${i}`)).toBeGreaterThanOrEqual(
                    PART_TRIANGLE_FLOOR,
                );
        }
        // …and the deck, the one big part, did the simplifying
        const distant = await partTriangles(result.model.parts.distant);
        expect(distant.get("deck")).toBeLessThan(2_000);
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
        const parts = await partTriangles(result.model.parts.distant);
        const total = [...parts.values()].reduce((n, t) => n + t, 0);
        expect(total).toBeLessThanOrEqual(DISTANT_TRIANGLE_CAP);
        expect(Math.min(...parts.values())).toBeGreaterThan(0);
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
            const parts = await partTriangles(part);
            expect(parts.size).toBe(1_500);
            expect(Math.min(...parts.values())).toBeGreaterThan(0);
        }
    }, 30_000);
});
