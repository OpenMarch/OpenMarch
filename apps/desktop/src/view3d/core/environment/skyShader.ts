// cspell:ignore recompiles Hoskins fract tonemap tonemapping
/**
 * The procedural sky shader, shared by the sky dome (`sky.ts`) and the
 * environment map (`envMap.ts`). Everything is computed per pixel from the
 * view direction, so the dome's own tessellation doesn't matter: a gradient
 * from the horizon (the fog color, so fogged ground meets the sky without a
 * seam) to the zenith, a band above the horizon that is strongest away from
 * the sun, a sun disc and glow, flat-bottomed clouds on a plane 1.5 km up,
 * and at night stars, a moon and a town's glow on the horizon.
 *
 * Every preset uses the same program (only uniforms change), so switching
 * presets never recompiles. `quality: "low"` builds the clouds from fewer
 * noise octaves and skips their lighting sample.
 */
import { Color, Vector3, type IUniform } from "three";
import type { LightingPreset } from "../types";
import { lightingValues } from "./lighting";

/** Hash and value noise without `sin`, stable at large inputs (Dave Hoskins). */
export const NOISE_GLSL = /* glsl */ `
float omHash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float omHash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}
float omNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(omHash12(i), omHash12(i + vec2(1.0, 0.0)), u.x),
        mix(omHash12(i + vec2(0.0, 1.0)), omHash12(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}
`;

export const SKY_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The sky's fragment shader. `tonemap` includes three's tone mapping chunk,
 * so the sky goes through the same curve as the fogged ground it meets
 * (`ShaderMaterial` only tone maps when the chunk is included). The
 * environment map leaves it out: it is rendered to a target in linear HDR.
 */
export function skyFragmentShader(options: {
    octaves: number;
    cloudLighting: boolean;
    tonemap: boolean;
    /** Paints a low treeline silhouette into the sky (low quality only). */
    landBand: boolean;
}): string {
    return /* glsl */ `
uniform vec3 top;
uniform vec3 bottom;
uniform vec3 uMid;
uniform vec3 uBand;
uniform float uBandStrength;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunDisc;
uniform vec3 uGlow;
uniform float uGlowStrength;
uniform float uCloudCover;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uCloudOpacity;
uniform float uStars;
uniform float uMoon;
uniform vec3 uMoonDir;
uniform vec3 uCity;
uniform float uCityStrength;
uniform vec3 uLand;
varying vec3 vWorld;
${NOISE_GLSL}
float omFbm(vec2 p) {
    float a = 0.5;
    float s = 0.0;
    for (int i = 0; i < ${options.octaves}; i++) {
        s += a * omNoise(p);
        p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.31;
        a *= 0.5;
    }
    return s / (1.0 - pow(0.5, float(${options.octaves})));
}
void main() {
    vec3 d = normalize(vWorld - cameraPosition);
    float h = d.y;
    float up = clamp(h, 0.0, 1.0);
    vec2 flat2 = normalize(d.xz + vec2(1e-5, 0.0));

    // Gradient: horizon haze, the mid sky about 15 degrees up, the zenith.
    vec3 col = mix(bottom, uMid, smoothstep(0.0, 0.26, pow(up, 0.8)));
    col = mix(col, top, smoothstep(0.18, 0.95, up));

    // Band above the horizon, strongest opposite the sun.
    float sunDot = dot(d, uSunDir);
    vec2 sunFlat = normalize(uSunDir.xz + vec2(1e-5, 0.0));
    float away = 0.5 - 0.5 * dot(flat2, sunFlat);
    float band = exp(-pow((h - 0.1) / 0.09, 2.0));
    col = mix(col, uBand, clamp(band * uBandStrength * (0.3 + 0.7 * away), 0.0, 1.0));

    // Sun glow: a wide halo low in the sky and a tight one round the disc.
    float g = max(sunDot, 0.0);
    float lowSky = 1.0 - 0.6 * up;
    col += uGlow * uGlowStrength * (0.35 * pow(g, 5.0) * lowSky + 0.45 * pow(g, 60.0) + 0.6 * pow(g, 900.0));

    // Town glow on the horizon toward -Z.
    float city = exp(-up * 14.0) * pow(max(dot(flat2, vec2(0.12, -0.99)), 0.0), 3.0);
    col += uCity * uCityStrength * city;

    // Stars: one candidate per cell of a 3D grid on the unit sphere.
    if (uStars > 0.0 && h > 0.0) {
        vec3 sp = d * 260.0;
        vec3 cell = floor(sp);
        float hs = omHash13(cell);
        if (hs > 0.975) {
            vec3 off = vec3(omHash13(cell + 1.7), omHash13(cell + 4.3), omHash13(cell + 9.1)) - 0.5;
            float dist = length(fract(sp) - 0.5 - off * 0.5);
            float mag = (hs - 0.975) / 0.025;
            float star = smoothstep(0.2, 0.0, dist) * (0.25 + 1.6 * mag * mag);
            col += vec3(0.85, 0.9, 1.0) * star * uStars * smoothstep(0.02, 0.25, h);
        }
        // A faint band of the Milky Way across the sky.
        vec3 axis = normalize(vec3(0.45, 0.25, 0.86));
        float mw = exp(-pow(dot(d, axis) / 0.16, 2.0));
        float mwn = omNoise(d.xz * 9.0 + d.y * 5.0) * omNoise(d.zy * 17.0);
        col += vec3(0.5, 0.55, 0.7) * 0.022 * uStars * mw * (0.4 + mwn) * smoothstep(0.05, 0.4, h);
    }

    // Moon: a gibbous disc lit from the upper left, and its halo.
    if (uMoon > 0.0) {
        float md = dot(d, uMoonDir);
        vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
        vec3 mu = cross(uMoonDir, mr);
        vec2 mp = vec2(dot(d, mr), dot(d, mu)) / 0.0105;
        float disc = smoothstep(1.0, 0.92, length(mp)) * step(0.0, md);
        float lit = smoothstep(-0.2, 0.25, length(mp - vec2(0.45, -0.1)) - 0.85);
        float mare = 0.82 + 0.18 * omNoise(mp * 2.3 + 3.0);
        col = mix(col, vec3(1.0, 0.97, 0.9) * uMoon * mare, disc * (1.0 - lit * 0.9));
        col += vec3(0.6, 0.68, 0.85) * 0.06 * uMoon * (pow(max(md, 0.0), 2500.0) + 0.25 * pow(max(md, 0.0), 400.0));
    }

    // Sun disc.
    col += uSunColor * uSunDisc * smoothstep(0.99985, 0.99992, sunDot);

    // Clouds on a plane 1.5 km up, faded out toward the horizon.
    if (uCloudCover > 0.0 && h > 0.0) {
        vec2 p = d.xz / max(h, 0.035) * 1.3 + vec2(3.7, 1.9);
        float n = omFbm(p);
        float edge = 1.0 - uCloudCover;
        float cover = smoothstep(edge, edge + 0.22, n);
        if (cover > 0.0) {
            ${
                options.cloudLighting
                    ? "float toward = omFbm(p + sunFlat * 0.18);\n            float lit = clamp(0.55 + (n - toward) * 3.5, 0.0, 1.0);"
                    : "float lit = 0.6;"
            }
            // Thick cores are darker underneath.
            lit *= 1.0 - 0.45 * smoothstep(edge + 0.1, edge + 0.45, n);
            vec3 cloud = mix(uCloudShade, uCloudLit, lit);
            cloud += uGlow * uGlowStrength * 0.5 * pow(g, 8.0) * (1.0 - cover * 0.6);
            // Far clouds sink into the haze.
            float far = smoothstep(0.03, 0.3, h);
            cloud = mix(bottom, cloud, 0.35 + 0.65 * far);
            col = mix(col, cloud, cover * uCloudOpacity * smoothstep(0.0, 0.06, h));
        }
    }

    // Below the horizon: the haze, a little darker, so the sky behind the
    // edge of the ground matches the fog.
    col = mix(col, bottom * 0.94, smoothstep(0.0, -0.02, h));
    ${
        options.landBand
            ? `// A treeline low on the horizon, painted instead of built.
    float azimuth = atan(d.z, d.x);
    float ridgeH = 0.008 + 0.014 * omNoise(vec2(azimuth * 7.0, 1.5))
        + 0.006 * omNoise(vec2(azimuth * 44.0, 4.5));
    col = mix(uLand, col, smoothstep(ridgeH - 0.0015, ridgeH + 0.0015, h));`
            : ""
    }
    gl_FragColor = vec4(col, 1.0);
    ${options.tonemap ? "#include <tonemapping_fragment>" : ""}
    #include <colorspace_fragment>
}
`;
}

export type SkyUniforms = Record<string, IUniform>;

export function createSkyUniforms(): SkyUniforms {
    return {
        top: { value: new Color() },
        bottom: { value: new Color() },
        uMid: { value: new Color() },
        uBand: { value: new Color() },
        uBandStrength: { value: 0 },
        uSunDir: { value: new Vector3(0, 1, 0) },
        uSunColor: { value: new Color() },
        uSunDisc: { value: 0 },
        uGlow: { value: new Color() },
        uGlowStrength: { value: 0 },
        uCloudCover: { value: 0 },
        uCloudLit: { value: new Color() },
        uCloudShade: { value: new Color() },
        uCloudOpacity: { value: 0 },
        uStars: { value: 0 },
        uMoon: { value: 0 },
        uMoonDir: { value: new Vector3(0, 0, -1) },
        uCity: { value: new Color() },
        uCityStrength: { value: 0 },
        uLand: { value: new Color() },
    };
}

/** Copies a preset's sky look into the uniforms. */
export function applySkyPreset(u: SkyUniforms, preset: LightingPreset): void {
    const v = lightingValues(preset);
    const s = v.sky;
    u.top.value.setHex(v.skyTop);
    u.bottom.value.setHex(v.fog);
    u.uMid.value.setHex(s.mid);
    u.uBand.value.setHex(s.band);
    u.uBandStrength.value = s.bandStrength;
    u.uSunDir.value.set(...v.sun.offset).normalize();
    u.uSunColor.value.setHex(v.sun.color);
    u.uSunDisc.value = v.sun.intensity > 0 ? s.sunDisc : 0;
    u.uGlow.value.setHex(s.glow);
    // At night the glow belongs to the moon.
    if (v.sun.intensity <= 0 && s.moon > 0) {
        u.uSunDir.value.set(...s.moonDirection).normalize();
    }
    u.uGlowStrength.value = s.glowStrength;
    u.uCloudCover.value = s.cloudCover;
    u.uCloudLit.value.setHex(s.cloudLit);
    u.uCloudShade.value.setHex(s.cloudShade);
    u.uCloudOpacity.value = s.cloudOpacity;
    u.uStars.value = s.stars;
    u.uMoon.value = s.moon;
    u.uMoonDir.value.set(...s.moonDirection).normalize();
    u.uCity.value.setHex(s.cityGlow);
    u.uCityStrength.value = s.cityGlowStrength;
    u.uLand.value.setHex(s.nearLand).lerp(u.bottom.value, s.nearHaze);
}
