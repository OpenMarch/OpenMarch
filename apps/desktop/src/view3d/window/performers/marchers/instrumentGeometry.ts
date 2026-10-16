// cspell:words metalnessmap roughnessmap
/**
 * An instrument as rigid geometry (docs/3d/instruments.md §4), colored per
 * vertex in the look's finish, and the smooth metallic material that draws
 * it from the same composed bones as the bodies. Right-hand pieces skin to
 * the prop bone (performer-behavior.md section 8.3), in the instrument's own
 * frame; chest and left-hand pieces sit in their bone's bind pose.
 */
import * as THREE from "three";
import { BRASS_COLORS } from "@/view3d/core/instruments/brass";
import type {
    InstrumentBone,
    InstrumentModel,
} from "@/view3d/core/instruments/model";
import type { Finish } from "@/view3d/core/instruments/catalog";
import type { Hold } from "@/view3d/core/instruments/holds";
import {
    PART_BLACK,
    PART_HEAD,
    PART_METAL,
    PART_SHELL,
    PART_SILK,
    PART_WOOD,
} from "@/view3d/core/instruments/mesh";
import { composedSkinning, type Composer } from "@/view3d/render/composer";
import type { ArmPose } from "./armPose";

/** The metal's sRGB color per finish: gold lacquer, silver lacquer. */
export const FINISH_COLORS: Record<Finish, number> = {
    brass: BRASS_COLORS[PART_METAL],
    silver: 0xd4d8de,
};

/** The instrument frame placed in the body frame by a hold. */
function placement(hold: Hold): THREE.Matrix4 {
    const z = new THREE.Vector3(...hold.instrument.bellAxis).normalize();
    // the caps axis need not be exactly perpendicular: square it against the bell
    const y = new THREE.Vector3(...hold.instrument.capsAxis);
    y.sub(z.clone().multiplyScalar(y.dot(z))).normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    return new THREE.Matrix4()
        .makeBasis(x, y, z)
        .setPosition(new THREE.Vector3(...hold.instrument.origin));
}

/**
 * The right hand's grip on the instrument: the matrix that takes points in
 * the instrument's own frame to the bind pose of a vertex skinned to the
 * right hand, so that skinned with the hand posed by `hold` they land on the
 * hold's placement. The prop bone is the hand's skinning matrix times this.
 */
export function gripMatrix(
    skeleton: THREE.Skeleton,
    pose: ArmPose,
    hold: Hold,
): THREE.Matrix4 {
    const index = skeleton.bones.findIndex((b) => b.name === "DEF-handR");
    if (index < 0) throw new Error("gripMatrix: no DEF-handR bone");
    return skeleton.boneInverses[index]
        .clone()
        .invert()
        .multiply(pose.handR.clone().invert())
        .multiply(placement(hold));
}

const BONE_NAMES: Record<InstrumentBone, string> = {
    handR: "DEF-handR",
    handL: "DEF-handL",
    spine002: "DEF-spine002",
};

const linear = (hex: number) => new THREE.Color(hex); // Color converts sRGB hex to linear

export function instrumentGeometry(
    skeleton: THREE.Skeleton,
    pose: ArmPose,
    hold: Hold,
    model: InstrumentModel,
    finish: Finish = "brass",
    /** sRGB: the section's color, for drum shells and flag silks. */
    sectionColor = 0xffffff,
): THREE.BufferGeometry {
    const place = placement(hold);
    /** Per bone: its index and the matrix taking placed body-frame points to the bind pose. */
    const frames = new Map<
        InstrumentBone,
        { index: number; toBind: THREE.Matrix4 }
    >();
    const frameOf = (bone: InstrumentBone) => {
        let f = frames.get(bone);
        if (f) return f;
        if (bone === "handR") {
            // the prop bone (after the skeleton's bones) is the right hand
            // times the hold's grip (`gripMatrix`), baked into every Horn
            // row: the piece stays in the instrument's own frame, and the
            // same geometry follows any hold or transition the channel plays
            f = { index: skeleton.bones.length, toBind: new THREE.Matrix4() };
            frames.set(bone, f);
            return f;
        }
        const index = skeleton.bones.findIndex(
            (b) => b.name === BONE_NAMES[bone],
        );
        if (index < 0)
            throw new Error(`instrumentGeometry: no ${BONE_NAMES[bone]} bone`);
        const bind = skeleton.boneInverses[index].clone().invert();
        // the left hand moves with the hold; the chest stays at bind
        const posed = bone === "handL" ? pose.handL : bind;
        const toBind = bind
            .clone()
            .multiply(posed.clone().invert())
            .multiply(place);
        f = { index, toBind };
        frames.set(bone, f);
        return f;
    };
    const metal = linear(FINISH_COLORS[finish]);
    const section = linear(sectionColor);
    const pos: number[] = [];
    const nrm: number[] = [];
    const col: number[] = [];
    const si: number[] = [];
    const sw: number[] = [];
    const part: number[] = [];
    const idx: number[] = [];
    const v = new THREE.Vector3();
    for (const piece of model.pieces) {
        const { index: boneIndex, toBind } = frameOf(
            piece.bone ?? model.bone ?? "handR",
        );
        const normalM = new THREE.Matrix3().getNormalMatrix(toBind);
        const first = pos.length / 3;
        const fallback = linear(
            BRASS_COLORS[piece.part] ?? BRASS_COLORS[PART_METAL],
        );
        for (let i = 0; i < piece.positions.length; i += 3) {
            v.set(
                piece.positions[i],
                piece.positions[i + 1],
                piece.positions[i + 2],
            ).applyMatrix4(toBind);
            pos.push(v.x, v.y, v.z);
            v.set(piece.normals[i], piece.normals[i + 1], piece.normals[i + 2])
                .applyMatrix3(normalM)
                .normalize();
            nrm.push(v.x, v.y, v.z);
            if (piece.part === PART_METAL) col.push(metal.r, metal.g, metal.b);
            else if (piece.part === PART_SHELL || piece.part === PART_SILK)
                col.push(section.r, section.g, section.b);
            else if (piece.colors)
                col.push(
                    piece.colors[i],
                    piece.colors[i + 1],
                    piece.colors[i + 2],
                );
            else col.push(fallback.r, fallback.g, fallback.b);
            si.push(boneIndex, 0, 0, 0);
            sw.push(1, 0, 0, 0);
            part.push(piece.part);
        }
        for (const k of piece.indices) idx.push(first + k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute("_part", new THREE.Float32BufferAttribute(part, 1));
    g.setIndex(idx);
    return g;
}

/**
 * Parts that aren't metal: a drill rifle's painted stock, a silk, rubber and
 * plastic, a drum's head. They draw matte, at {@link MATTE_ROUGHNESS}; a
 * metallic surface shows only reflections, so a white stock would read as
 * chrome.
 */
export const MATTE_PARTS = [PART_WOOD, PART_SILK, PART_BLACK, PART_HEAD];
export const MATTE_ROUGHNESS = 0.65;

/**
 * Patches a standard material's shaders so vertices whose `_part` is one
 * of the {@link MATTE_PARTS} draw non-metallic at {@link MATTE_ROUGHNESS}.
 */
export function matteShader(shader: {
    vertexShader: string;
    fragmentShader: string;
}): void {
    const isMatte = MATTE_PARTS.map(
        (p) => `abs(_part - ${p.toFixed(1)}) < 0.5`,
    ).join(" || ");
    shader.vertexShader = shader.vertexShader
        .replace(
            "#include <common>",
            "#include <common>\nattribute float _part;\nvarying float vMatte;",
        )
        .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>\n  vMatte = (${isMatte}) ? 1.0 : 0.0;`,
        );
    shader.fragmentShader = shader.fragmentShader
        .replace(
            "#include <common>",
            "#include <common>\nvarying float vMatte;",
        )
        .replace(
            "#include <metalnessmap_fragment>",
            "#include <metalnessmap_fragment>\n  metalnessFactor *= 1.0 - vMatte;",
        )
        .replace(
            "#include <roughnessmap_fragment>",
            `#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, ${MATTE_ROUGHNESS.toFixed(2)}, vMatte);`,
        );
}

/**
 * The instruments' material: smooth, metallic, colored per vertex, skinned
 * from the same composed bones as the bodies, with the {@link MATTE_PARTS}
 * matte. One per marcher set.
 */
export function instrumentMaterial(
    composer: Composer,
): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 1,
        roughness: 0.25,
        vertexColors: true,
        flatShading: false,
        envMapIntensity: 1,
        // bells and tube ends are open surfaces: looking into a bell must show its inside
        side: THREE.DoubleSide,
    });
    // composedSkinning chains onto this, so it runs first
    material.onBeforeCompile = matteShader;
    return composedSkinning(material, composer);
}
