// @vitest-environment node
/** A rigged model, frozen standing still (#1168) */
import { describe, expect, it } from "vitest";
import { Document } from "@gltf-transform/core";
import { freezeSkins } from "../skins";

/** One triangle skinned to two joints, the first vertex half on each */
function rig(jointTranslation: [number, number, number]) {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene();
    const accessor = (
        type: "VEC3" | "VEC4",
        array: Float32Array | Uint8Array,
    ) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const prim = doc
        .createPrimitive()
        .setAttribute(
            "POSITION",
            accessor("VEC3", new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])),
        )
        .setAttribute(
            "NORMAL",
            accessor("VEC3", new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1])),
        )
        .setAttribute(
            "JOINTS_0",
            accessor(
                "VEC4",
                new Uint8Array([0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
            ),
        )
        .setAttribute(
            "WEIGHTS_0",
            accessor(
                "VEC4",
                new Float32Array([0.5, 0.5, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
            ),
        );
    const still = doc.createNode("still");
    const moved = doc.createNode("moved").setTranslation(jointTranslation);
    // The skinned node's own transform and parent are ignored, as glTF says
    const holder = doc.createNode("holder").setScale([10, 10, 10]);
    const skinned = doc
        .createNode("skinned")
        .setTranslation([5, 5, 5])
        .setMesh(doc.createMesh().addPrimitive(prim))
        .setSkin(doc.createSkin().addJoint(still).addJoint(moved));
    holder.addChild(skinned);
    scene.addChild(still).addChild(moved).addChild(holder);
    return { doc, scene, skinned };
}

const positions = (node: ReturnType<typeof rig>["skinned"]) =>
    Array.from(
        node
            .getMesh()!
            .listPrimitives()[0]
            .getAttribute("POSITION")!
            .getArray()!,
    );

describe("freezing a rig", () => {
    it("poses each vertex by its weighted joints and drops the rig", () => {
        const { doc, scene, skinned } = rig([0, 0, 2]);
        expect(freezeSkins(doc, scene)).toBe(1);
        // The first vertex half on the moved joint: 1 m forward; the others all on it: 2 m
        expect(positions(skinned)).toEqual([0, 0, 1, 1, 0, 2, 0, 1, 2]);
        const prim = skinned.getMesh()!.listPrimitives()[0];
        expect(prim.listSemantics().sort()).toEqual(["NORMAL", "POSITION"]);
        expect(doc.getRoot().listSkins()).toEqual([]);
        expect(skinned.getSkin()).toBeNull();
        // In world space, at the scene's root with no transform of its own
        expect(scene.listChildren()).toContain(skinned);
        expect(skinned.getWorldMatrix()).toEqual([
            1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        ]);
    });

    it("keeps a frozen node's children where they were in the world", () => {
        const { doc, scene, skinned } = rig([0, 0, 2]);
        const hat = doc.createNode("hat").setTranslation([0, 1, 0]);
        skinned.addChild(hat);
        // Held by the skinned node, under the holder's 10× scale: 50, 60, 50 in the world
        const before = hat.getWorldMatrix();
        expect(before.slice(12, 15)).toEqual([50, 60, 50]);
        freezeSkins(doc, scene);
        expect(scene.listChildren()).toContain(hat);
        expect(hat.getWorldMatrix()).toEqual(before);
    });

    it("poses a copy of a mesh another node also draws", () => {
        const { doc, scene, skinned } = rig([0, 0, 2]);
        const plain = doc.createNode("plain").setMesh(skinned.getMesh());
        scene.addChild(plain);
        freezeSkins(doc, scene);
        expect(positions(skinned)).toEqual([0, 0, 1, 1, 0, 2, 0, 1, 2]);
        expect(positions(plain)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    });

    it("freezes a mesh two rigged nodes share", () => {
        const { doc, scene, skinned } = rig([0, 0, 2]);
        const twin = doc
            .createNode("twin")
            .setMesh(skinned.getMesh())
            .setSkin(skinned.getSkin());
        scene.addChild(twin);
        expect(freezeSkins(doc, scene)).toBe(2);
        expect(positions(twin)).toEqual([0, 0, 1, 1, 0, 2, 0, 1, 2]);
    });

    it("poses vertices two parts of a mesh share once", () => {
        const { doc, scene, skinned } = rig([0, 0, 2]);
        const mesh = skinned.getMesh()!;
        mesh.addPrimitive(mesh.listPrimitives()[0].clone());
        freezeSkins(doc, scene);
        const [a, b] = skinned.getMesh()!.listPrimitives();
        expect(a.getAttribute("POSITION")).toBe(b.getAttribute("POSITION"));
        expect(positions(skinned)).toEqual([0, 0, 1, 1, 0, 2, 0, 1, 2]);
    });

    it("poses each part of a mesh by its own vertices", () => {
        const { doc, scene, skinned } = rig([0, 0, 2]);
        const mesh = skinned.getMesh()!;
        const first = mesh.listPrimitives()[0];
        const second = first.clone();
        second.setAttribute(
            "POSITION",
            first
                .getAttribute("POSITION")!
                .clone()
                .setArray(new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0])),
        );
        mesh.addPrimitive(second);
        freezeSkins(doc, scene);
        const [, posedSecond] = skinned.getMesh()!.listPrimitives();
        expect(
            Array.from(posedSecond.getAttribute("POSITION")!.getArray()!),
        ).toEqual([0, 0, 1, 2, 0, 2, 0, 2, 2]);
    });

    it("can't freeze a rig whose second joint set names a joint it doesn't have", () => {
        const { doc, scene, skinned } = rig([0, 0, 2]);
        const prim = skinned.getMesh()!.listPrimitives()[0];
        const buffer = doc.getRoot().listBuffers()[0];
        prim.setAttribute(
            "JOINTS_1",
            doc
                .createAccessor()
                .setType("VEC4")
                .setArray(new Uint8Array([7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
                .setBuffer(buffer),
        ).setAttribute(
            "WEIGHTS_1",
            doc
                .createAccessor()
                .setType("VEC4")
                .setArray(new Float32Array(12))
                .setBuffer(buffer),
        );
        expect(freezeSkins(doc, scene)).toBeNull();
    });

    it("can't freeze a rig whose weights are missing", () => {
        const { doc, scene, skinned } = rig([0, 0, 2]);
        skinned.getMesh()!.listPrimitives()[0].setAttribute("WEIGHTS_0", null);
        expect(freezeSkins(doc, scene)).toBeNull();
        expect(skinned.getSkin()).not.toBeNull();
    });

    it("leaves a model with no rig alone", () => {
        const doc = new Document();
        const scene = doc.createScene();
        scene.addChild(doc.createNode().setMesh(doc.createMesh()));
        expect(freezeSkins(doc, scene)).toBe(0);
    });
});
