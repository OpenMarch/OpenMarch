// cspell:words metalnessmap roughnessmap clearcoat envmap
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
    PART_CHROME,
    PART_HEAD,
    PART_METAL,
    PART_SHELL,
    PART_SILK,
    PART_WOOD,
} from "@/view3d/core/instruments/mesh";
import { composedSkinning, type Composer } from "@/view3d/render/composer";
import type { ArmPose } from "./armPose";

/**
 * The metal's sRGB color per finish: yellow brass under clear gold lacquer,
 * and bright silver plate. Both are a metal's reflectance, which is far
 * paler than the color the eye names: a lit horn takes most of its color
 * from what it reflects.
 */
export const FINISH_COLORS: Record<Finish, number> = {
    brass: BRASS_COLORS[PART_METAL],
    silver: 0xf6f5f0,
};

/**
 * How a surface answers light: metalness, roughness and how much clear
 * coat lies over it. Lacquered brass is polished metal under a glossy
 * coat, which gives it a second, sharper highlight; silver plate is bare
 * and nearly a mirror; nickel trim (valve caps, keys, slides' inner legs)
 * is a mirror too. The {@link MATTE_PARTS} are not metal at all.
 */
export interface Surface {
    metalness: number;
    roughness: number;
    coat: number;
}
export const MATTE_ROUGHNESS = 0.65;
const SURFACES = {
    lacquer: { metalness: 1, roughness: 0.2, coat: 1 },
    silver: { metalness: 1, roughness: 0.17, coat: 0 },
    nickel: { metalness: 1, roughness: 0.1, coat: 0 },
    shell: { metalness: 1, roughness: 0.25, coat: 0 },
    matte: { metalness: 0, roughness: MATTE_ROUGHNESS, coat: 0 },
} satisfies Record<string, Surface>;

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
    head: "DEF-spine006",
};

const linear = (hex: number) => new THREE.Color(hex); // Color converts sRGB hex to linear

/** Where a bone's pieces go: the bone's index, and the matrix to its bind pose. */
export interface InstrumentFrame {
    index: number;
    /** Takes instrument-frame points to the bind pose of a vertex on this bone. */
    toBind: THREE.Matrix4;
}

/**
 * Per bone, how instrument-frame points skin to it under `hold`: right-hand
 * pieces ride the prop bone (after the skeleton's bones), which is the
 * right hand times the hold's grip (`gripMatrix`), baked into every Horn
 * row, so they stay in the instrument's own frame and follow any hold or
 * transition the channel plays; left-hand pieces move with the hold's left
 * hand; chest pieces stay at bind; head pieces (a beret), built in the
 * body's frame at bind, ride the head as the hold turns it.
 */
export function instrumentFrames(
    skeleton: THREE.Skeleton,
    pose: ArmPose,
    hold: Hold,
): (bone: InstrumentBone) => InstrumentFrame {
    const place = placement(hold);
    const frames = new Map<InstrumentBone, InstrumentFrame>();
    return (bone) => {
        let f = frames.get(bone);
        if (f) return f;
        if (bone === "handR") {
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
        if (bone === "head") {
            // head pieces are built in the body's frame at bind already
            f = { index, toBind: new THREE.Matrix4() };
            frames.set(bone, f);
            return f;
        }
        const posed = bone === "handL" ? pose.handL : bind;
        const toBind = bind
            .clone()
            .multiply(posed.clone().invert())
            .multiply(place);
        f = { index, toBind };
        frames.set(bone, f);
        return f;
    };
}

export function instrumentGeometry(
    skeleton: THREE.Skeleton,
    pose: ArmPose,
    hold: Hold,
    model: InstrumentModel,
    finish: Finish = "brass",
    /** sRGB: the section's color, for drum shells and flag silks. */
    sectionColor = 0xffffff,
): THREE.BufferGeometry {
    const frameOf = instrumentFrames(skeleton, pose, hold);
    const metal = linear(FINISH_COLORS[finish]);
    const section = linear(sectionColor);
    const pos: number[] = [];
    const nrm: number[] = [];
    const col: number[] = [];
    const si: number[] = [];
    const sw: number[] = [];
    const part: number[] = [];
    const surf: number[] = [];
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
        const surface = surfaceOf(piece.part, finish);
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
            surf.push(surface.metalness, surface.roughness, surface.coat);
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
    g.setAttribute("_surface", new THREE.Float32BufferAttribute(surf, 3));
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

/** The surface of a part in a finish. */
export function surfaceOf(part: number, finish: Finish): Surface {
    if (MATTE_PARTS.includes(part)) return SURFACES.matte;
    if (part === PART_METAL)
        return finish === "silver" ? SURFACES.silver : SURFACES.lacquer;
    if (part === PART_CHROME) return SURFACES.nickel;
    return SURFACES.shell;
}

/**
 * How much brighter instruments take the environment than the scene does
 * (`scene.environmentIntensity`, tuned for turf and uniforms): polished
 * metal is lit by little else.
 */
export const ENVIRONMENT_BOOST = 1.7;

/**
 * Patches a physical material's shaders so each vertex draws with its own
 * `_surface` (metalness, roughness, clear coat: {@link surfaceOf}), and
 * reflects the environment {@link ENVIRONMENT_BOOST} times as brightly.
 */
export function surfaceShader(shader: {
    vertexShader: string;
    fragmentShader: string;
}): void {
    shader.vertexShader = shader.vertexShader
        .replace(
            "#include <common>",
            "#include <common>\nattribute vec3 _surface;\nvarying vec3 vSurface;",
        )
        .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\n  vSurface = _surface;",
        );
    shader.fragmentShader = shader.fragmentShader
        .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vSurface;",
        )
        .replace(
            "#include <metalnessmap_fragment>",
            "#include <metalnessmap_fragment>\n  metalnessFactor = vSurface.x;",
        )
        .replace(
            "#include <roughnessmap_fragment>",
            "#include <roughnessmap_fragment>\n  roughnessFactor = vSurface.y;",
        )
        .replace(
            "#include <lights_physical_fragment>",
            "#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n  material.clearcoat *= vSurface.z;\n#endif",
        )
        .replace(
            "#include <envmap_physical_pars_fragment>",
            THREE.ShaderChunk.envmap_physical_pars_fragment.replaceAll(
                "envMapIntensity",
                `(envMapIntensity * ${ENVIRONMENT_BOOST.toFixed(2)})`,
            ),
        );
}

/**
 * The instruments' material: smooth, colored per vertex, skinned from the
 * same composed bones as the bodies, each vertex a lacquered, plated or
 * matte surface by its part and finish. One per marcher set.
 */
export function instrumentMaterial(
    composer: Composer,
): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        // per vertex in the shader; these are what an unpatched draw would use
        metalness: 1,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        vertexColors: true,
        flatShading: false,
        // bells and tube ends are open surfaces: looking into a bell must show its inside
        side: THREE.DoubleSide,
    });
    // composedSkinning chains onto this, so it runs first
    material.onBeforeCompile = surfaceShader;
    return composedSkinning(material, composer);
}
