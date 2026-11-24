// cspell:ignore fract
import type {
    MeshStandardMaterial,
    WebGLProgramParametersWithUniforms,
} from "three";
import { FIVE_YARDS } from "./turfPlan";

/**
 * Synthetic turf's lay (docs/3d/fidelity.md section 5, item 2). The turf
 * goes down in rolls 5 yards wide, and the fibers of neighboring rolls lean
 * opposite ways, toward one sideline or the other. Fibers leaning away from
 * the eye catch the light and look lighter; leaning toward it, darker. So
 * the 5-yard bands show most from the sidelines at a low angle, fade from
 * overhead and from the end zones, and swap light for dark from the other
 * sideline.
 *
 * Patches the field's `MeshStandardMaterial`: a world-position varying, and
 * after `map_fragment` the albedo scaled by `1 + LAY * s * along * graze`,
 * where `s` is +1 on even bands (the ones the canvas paints light, so the
 * front sideline sees them light) and -1 on odd ones, `along` is the view
 * direction's share along z, and `graze` how low the view is. A few ALU ops,
 * no texture taps, every quality.
 */

/** How much the lay brightens or darkens a band at a grazing view. */
export const TURF_LAY = 0.05;

/** The shader chunks the patch hooks; a test pins them to three's. */
export const TURF_SHEEN_CHUNKS = {
    vertex: ["#include <common>", "#include <project_vertex>"],
    fragment: [
        "#include <common>",
        "#include <map_fragment>",
        "#include <lights_physical_fragment>",
    ],
} as const;

const KEY = "turfSheen3";

/** Contrast of the blade-scale grain at full strength (near the camera). */
export const TURF_GRAIN = 0.24;
/** How much a grazing view lifts the fibers toward a pale sheen. */
export const TURF_SHEEN = 0.12;
/**
 * The fibers' specular, as a share of a plain dielectric's. A field of thin
 * blades scatters the lamps instead of mirroring them: at full strength the
 * surface's grazing Fresnel laid a white veil over the whole far field, which
 * read pale and yellow beside the photos' saturated green.
 */
export const TURF_SPECULAR = 0.2;
/** Share of the surface that is rubber crumb showing between fibers. */
export const TURF_CRUMB = 0.12;

/** Smooth value noise over a unit grid, 0 to 1. */
const NOISE_GLSL = `
#define TURF_GRAIN ${TURF_GRAIN.toFixed(3)}
#define TURF_SHEEN ${TURF_SHEEN.toFixed(3)}
#define TURF_CRUMB ${TURF_CRUMB.toFixed(3)}
float turfHash(vec2 p) {
    // Tiles every 1024 cells, which keeps the products small enough for
    // float precision far from the origin.
    p = fract(mod(p, 1024.0) * vec2(0.1031, 0.1030) + 0.37);
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}
float turfNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = turfHash(i);
    float b = turfHash(i + vec2(1.0, 0.0));
    float c = turfHash(i + vec2(0.0, 1.0));
    float d = turfHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

export function patchTurfShader(
    shader: Pick<
        WebGLProgramParametersWithUniforms,
        "vertexShader" | "fragmentShader" | "uniforms"
    >,
    lay = TURF_LAY,
): void {
    shader.uniforms.uTurfLay = { value: lay };
    shader.vertexShader = shader.vertexShader
        .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vTurfWorld;",
        )
        .replace(
            "#include <project_vertex>",
            "#include <project_vertex>\nvTurfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );
    shader.fragmentShader = shader.fragmentShader
        .replace(
            "#include <common>",
            `#include <common>\nvarying vec3 vTurfWorld;\nuniform float uTurfLay;\n${NOISE_GLSL}`,
        )
        .replace(
            "#include <map_fragment>",
            [
                "#include <map_fragment>",
                `float turfBand = floor(vTurfWorld.x / ${FIVE_YARDS.toFixed(4)});`,
                "float turfSide = mod(turfBand, 2.0) < 0.5 ? 1.0 : -1.0;",
                "vec3 turfView = cameraPosition - vTurfWorld;",
                "float turfFlat = max(length(turfView.xz), 1e-3);",
                "float turfAlong = turfView.z / turfFlat;",
                "float turfGraze = turfFlat / max(length(turfView), 1e-3);",
                "diffuseColor.rgb *= 1.0 + uTurfLay * turfSide * turfAlong * turfGraze;",
                // The fibers' sheen: seen low across the field their sides
                // catch the lamps, a lift with no change of hue. It stays
                // mostly the fibers' own green: lit polyethylene keeps its
                // color, and a lift toward gray (with the surface's grazing
                // Fresnel on top) washed the far field out pale.
                "float turfGray = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));",
                "diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.1 + vec3(turfGray) * 0.25, TURF_SHEEN * pow(turfGraze, 8.0));",
                // A soft unevenness meters across, so a wide view of the field
                // is never one flat green (procedural: nothing tiles).
                "diffuseColor.rgb *= 0.97 + 0.06 * turfNoise(vTurfWorld.xz * 0.14 + 3.0);",
                // Blade-scale grain the texture is too coarse for up close:
                // fiber tufts about a centimeter across and a few long, faded
                // out where a tuft gets smaller than a pixel.
                "vec2 turfTuft = vTurfWorld.xz * vec2(110.0, 38.0);",
                "float turfFade = clamp(1.5 - 1.2 * length(fwidth(turfTuft)), 0.0, 1.0);",
                "float turfGrain = turfNoise(turfTuft) * 0.6 + turfNoise(turfTuft * 2.7 + 17.0) * 0.4;",
                "diffuseColor.rgb *= 1.0 + (turfGrain - 0.5) * TURF_GRAIN * turfFade;",
                // The rubber crumb between the fibers: dark specks a few
                // millimeters across, only where they are bigger than a pixel.
                "vec2 turfCrumbP = vTurfWorld.xz * 180.0;",
                "float turfCrumbFade = clamp(1.6 - 1.4 * length(fwidth(turfCrumbP)), 0.0, 1.0);",
                "float turfCrumbAt = step(1.0 - TURF_CRUMB, turfHash(floor(turfCrumbP)));",
                "diffuseColor.rgb *= 1.0 - 0.45 * turfCrumbAt * turfCrumbFade;",
            ].join("\n"),
        );
    patchTurfSpecular(shader);
}

/** Scales a standard material's specular to the fibers' (`TURF_SPECULAR`). */
function patchTurfSpecular(
    shader: Pick<WebGLProgramParametersWithUniforms, "fragmentShader">,
): void {
    shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_physical_fragment>",
        [
            "#include <lights_physical_fragment>",
            `material.specularColor *= ${TURF_SPECULAR.toFixed(3)};`,
            `material.specularColorBlended *= ${TURF_SPECULAR.toFixed(3)};`,
            `material.specularF90 *= ${TURF_SPECULAR.toFixed(3)};`,
        ].join("\n"),
    );
}

/** Gives the field's material synthetic turf's lay. */
export function applyTurfSheen(
    material: MeshStandardMaterial,
    lay = TURF_LAY,
): void {
    material.onBeforeCompile = (shader) => patchTurfShader(shader, lay);
    material.customProgramCacheKey = () => `${KEY}:${lay}`;
}
