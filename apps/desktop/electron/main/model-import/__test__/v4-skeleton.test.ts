// @vitest-environment node
import { NodeIO } from "@gltf-transform/core";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BODY_TYPES } from "@/view3d/core/marchers/looks";
import { GARMENT_BODY_TYPES } from "../rules";
import { V4_INVERSE_BIND_MATRICES, V4_JOINT_NAMES } from "../v4-skeleton";

const BODIES = path.join(
    __dirname,
    "../../../../src/view3d/assets/om-pose/bodies",
);

describe("v4 skeleton", () => {
    it("lists the same body types as the renderer", () => {
        expect([...GARMENT_BODY_TYPES]).toEqual([...BODY_TYPES]);
    });

    it.each(BODY_TYPES)("matches the bundled %s body", async (body) => {
        const doc = await new NodeIO().read(path.join(BODIES, `${body}.glb`));
        const skin = doc.getRoot().listSkins()[0];
        expect(skin.listJoints().map((j) => j.getName())).toEqual([
            ...V4_JOINT_NAMES,
        ]);
        const ibm = skin.getInverseBindMatrices()!.getArray()!;
        V4_INVERSE_BIND_MATRICES.flat().forEach((v, i) =>
            expect(ibm[i]).toBeCloseTo(v, 5),
        );
    });
});
