// cspell:ignore tonemapping Jimenez prefilter prefiltered Cineon CINEON OETF Reinhard REINHARD AGX multisampling highp fract
/**
 * The 3D View's post pass: bloom and lens ghosts for venues whose lighting
 * asks for them (`LightingValues.bloom`), at high quality only. Framework-free
 * three.js (ADR 0010 D-1); the window mounts it (`window/PostFx.tsx`).
 *
 * A venue without bloom never builds this, so its frame costs what it always
 * did. With it, a frame is:
 *
 * 1. the scene, drawn in linear light into a half-float target with 4x
 *    multisampling, so a lamp keeps its real brightness instead of clipping
 *    at white;
 * 2. a bright pass at half resolution: what is over the threshold after
 *    exposure, with a soft knee;
 * 3. a mip chain down (13 taps a step) and back up (a 3x3 tent a step),
 *    which is a wide blur for about a third of a full-screen pass in pixels;
 * 4. one composite to the canvas: scene plus bloom plus ghosts, then the
 *    renderer's own tone mapping and color space, then a little dither so
 *    the dark hall doesn't band.
 *
 * Nothing here keeps state between frames, so a paused show with a still
 * camera still draws nothing (`drawPolicy.ts`).
 */
import {
    AgXToneMapping,
    ACESFilmicToneMapping,
    BufferGeometry,
    CineonToneMapping,
    Color,
    ColorManagement,
    CustomToneMapping,
    Float32BufferAttribute,
    HalfFloatType,
    LinearFilter,
    LinearToneMapping,
    Mesh,
    NeutralToneMapping,
    NoToneMapping,
    OrthographicCamera,
    RawShaderMaterial,
    ReinhardToneMapping,
    SRGBTransfer,
    Vector2,
    WebGLRenderTarget,
    type Camera,
    type Scene,
    type ToneMapping,
    type WebGLRenderer,
} from "three";

/** How a venue's lamps bloom. Every field can change between frames. */
export interface BloomSettings {
    /** How much of the blurred light is added back. 0 turns bloom off. */
    strength: number;
    /**
     * How wide the glow is, 0 to 1: the weight each wider blur gets against
     * the one inside it.
     */
    radius: number;
    /**
     * Brightness, after exposure, where bloom starts. Over 1, so white
     * uniforms and yard lines never glow; only lamps and LED boards do.
     */
    threshold: number;
    /** Width of the soft start below the threshold. */
    knee: number;
    /**
     * Lens ghosts: a faint tinted copy of the hottest lamps, pushed out from
     * the middle of the picture, as a phone camera makes. 0 is none.
     */
    ghost: number;
    /** Brightness, after exposure, a lamp needs before it ghosts. */
    ghostThreshold: number;
    /** sRGB hex. */
    ghostTint: number;
}

export interface PostPipeline {
    /** Live: change a field and the next frame uses it. */
    settings: BloomSettings;
    /**
     * Where the scene is drawn. Shaders compiled ahead of time must be
     * compiled with this bound, because a material compiles differently for
     * a target than for the canvas.
     */
    readonly sceneTarget: WebGLRenderTarget;
    /** Draws one frame to the canvas. */
    render(scene: Scene, camera: Camera): void;
    dispose(): void;
}

/** True where the renderer can draw into half-float targets. */
export function supportsPostPipeline(gl: WebGLRenderer): boolean {
    return (
        gl.capabilities.isWebGL2 &&
        (gl.extensions.has("EXT_color_buffer_float") ||
            gl.extensions.has("EXT_color_buffer_half_float"))
    );
}

/** The most blur steps; each one doubles the glow's reach. */
const MAX_LEVELS = 5;
/** The smallest blur target's short side, in pixels. */
const MIN_LEVEL_SIZE = 12;
/**
 * A lamp brighter than this (after exposure) blooms no wider. It keeps a
 * camera on the field, looking up into a whole row of beams, from whiting
 * out.
 */
const MAX_BRIGHT = 32;

const VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * The bright pass, at half resolution. rgb is the light over the threshold;
 * alpha is how far over the ghost threshold it is, for the lens ghosts.
 */
const PREFILTER = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uThreshold;
uniform float uKnee;
uniform float uGhostThreshold;
varying vec2 vUv;

vec3 tap(vec2 offset) {
    return min(texture2D(tSource, vUv + offset * uTexel).rgb * uExposure, vec3(${MAX_BRIGHT.toFixed(1)}));
}

void main() {
    // Four bilinear taps over a 4x4 block: a lamp a pixel wide doesn't
    // flicker as it crosses pixel edges.
    vec3 color = 0.25 * (tap(vec2(-1.0, -1.0)) + tap(vec2(1.0, -1.0)) +
        tap(vec2(-1.0, 1.0)) + tap(vec2(1.0, 1.0)));
    float brightness = max(color.r, max(color.g, color.b));
    float soft = clamp(brightness - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    float over = max(soft, brightness - uThreshold) / max(brightness, 1e-4);
    // Capped, so a whole cluster of lamps makes no more ghost than one.
    float hot = min(max(brightness - uGhostThreshold, 0.0), 4.0);
    gl_FragColor = vec4(color * over, hot);
}
`;

/** One step down: 13 taps (Jimenez, "Next Generation Post Processing"). */
const DOWN = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
uniform vec2 uTexel;
varying vec2 vUv;

vec4 tap(float x, float y) {
    return texture2D(tSource, vUv + vec2(x, y) * uTexel);
}

void main() {
    vec4 a = tap(-2.0, 2.0), b = tap(0.0, 2.0), c = tap(2.0, 2.0);
    vec4 d = tap(-2.0, 0.0), e = tap(0.0, 0.0), f = tap(2.0, 0.0);
    vec4 g = tap(-2.0, -2.0), h = tap(0.0, -2.0), i = tap(2.0, -2.0);
    vec4 j = tap(-1.0, 1.0), k = tap(1.0, 1.0);
    vec4 l = tap(-1.0, -1.0), m = tap(1.0, -1.0);
    gl_FragColor = e * 0.125 + (a + c + g + i) * 0.03125 +
        (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
}
`;

/** One step up: a 3x3 tent of the wider blur, added to this level's own. */
const UP = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
uniform sampler2D tWider;
uniform vec2 uTexel;
uniform float uSpread;
varying vec2 vUv;

vec4 tap(float x, float y) {
    return texture2D(tWider, vUv + vec2(x, y) * uTexel);
}

void main() {
    vec4 wide = (tap(-1.0, 1.0) + tap(1.0, 1.0) + tap(-1.0, -1.0) + tap(1.0, -1.0)) * 0.0625 +
        (tap(0.0, 1.0) + tap(0.0, -1.0) + tap(-1.0, 0.0) + tap(1.0, 0.0)) * 0.125 +
        tap(0.0, 0.0) * 0.25;
    gl_FragColor = texture2D(tSource, vUv) + wide * uSpread;
}
`;

/** Scene plus bloom plus ghosts, then tone mapping and the color space. */
const COMPOSITE = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tGhost;
uniform float uStrength;
uniform float uGhost;
uniform vec3 uGhostTint;
uniform float uInverseExposure;
varying vec2 vUv;

#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec3 color = texture2D(tScene, vUv).rgb;
    // The blur is of exposed light; the scene is not exposed yet.
    vec3 glow = texture2D(tBloom, vUv).rgb * uStrength;
#ifdef LENS_GHOSTS
    // A lamp's ghost lands a little farther from the middle than the lamp,
    // and a fainter, larger one farther still.
    vec2 fromCenter = vUv - 0.5;
    float near = texture2D(tGhost, 0.5 + fromCenter / 1.055).a;
    float far = texture2D(tGhost, 0.5 + fromCenter / 1.16).a;
    glow += uGhostTint * uGhost * (near + 0.15 * far);
#endif
    gl_FragColor = vec4(color + glow * uInverseExposure, 1.0);

#ifdef LINEAR_TONE_MAPPING
    gl_FragColor.rgb = LinearToneMapping(gl_FragColor.rgb);
#elif defined(REINHARD_TONE_MAPPING)
    gl_FragColor.rgb = ReinhardToneMapping(gl_FragColor.rgb);
#elif defined(CINEON_TONE_MAPPING)
    gl_FragColor.rgb = CineonToneMapping(gl_FragColor.rgb);
#elif defined(ACES_FILMIC_TONE_MAPPING)
    gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
#elif defined(AGX_TONE_MAPPING)
    gl_FragColor.rgb = AgXToneMapping(gl_FragColor.rgb);
#elif defined(NEUTRAL_TONE_MAPPING)
    gl_FragColor.rgb = NeutralToneMapping(gl_FragColor.rgb);
#elif defined(CUSTOM_TONE_MAPPING)
    gl_FragColor.rgb = CustomToneMapping(gl_FragColor.rgb);
#endif

#ifdef SRGB_TRANSFER
    gl_FragColor = sRGBTransferOETF(gl_FragColor);
#endif
    // Half a display step of noise: dark gradients don't band.
    gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
}
`;

const TONE_DEFINES: Partial<Record<ToneMapping, string>> = {
    [LinearToneMapping]: "LINEAR_TONE_MAPPING",
    [ReinhardToneMapping]: "REINHARD_TONE_MAPPING",
    [CineonToneMapping]: "CINEON_TONE_MAPPING",
    [ACESFilmicToneMapping]: "ACES_FILMIC_TONE_MAPPING",
    [AgXToneMapping]: "AGX_TONE_MAPPING",
    [NeutralToneMapping]: "NEUTRAL_TONE_MAPPING",
    [CustomToneMapping]: "CUSTOM_TONE_MAPPING",
};

/** The blur targets' sizes for a drawing buffer, widest blur last. */
export function bloomLevelSizes(
    width: number,
    height: number,
): [number, number][] {
    const sizes: [number, number][] = [];
    let w = Math.max(1, Math.floor(width / 2));
    let h = Math.max(1, Math.floor(height / 2));
    for (let i = 0; i < MAX_LEVELS; i++) {
        sizes.push([w, h]);
        if (Math.min(w, h) < MIN_LEVEL_SIZE * 2) break;
        w = Math.floor(w / 2);
        h = Math.floor(h / 2);
    }
    return sizes;
}

function pass(fragmentShader: string, uniforms: Record<string, unknown>) {
    return new RawShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader,
        uniforms: Object.fromEntries(
            Object.entries(uniforms).map(([k, value]) => [k, { value }]),
        ),
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
    });
}

// eslint-disable-next-line max-lines-per-function
export function createPostPipeline(
    gl: WebGLRenderer,
    settings: BloomSettings,
): PostPipeline {
    const size = gl.getDrawingBufferSize(new Vector2());
    const sceneTarget = new WebGLRenderTarget(size.x, size.y, {
        type: HalfFloatType,
        samples: 4,
        depthBuffer: true,
        stencilBuffer: false,
        resolveDepthBuffer: false,
    });
    sceneTarget.texture.name = "view3d.post.scene";

    const blurTarget = () =>
        new WebGLRenderTarget(1, 1, {
            type: HalfFloatType,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            depthBuffer: false,
            stencilBuffer: false,
        });
    // down[i] is the scene's bright light blurred i steps; up[i] is that
    // plus every wider blur. The widest level is its own `up`.
    let down: WebGLRenderTarget[] = [];
    let up: WebGLRenderTarget[] = [];
    let sizes: [number, number][] = [];
    const resize = (width: number, height: number) => {
        sceneTarget.setSize(width, height);
        sizes = bloomLevelSizes(width, height);
        [...down, ...up].forEach((t) => t.dispose());
        down = sizes.map(blurTarget);
        up = sizes.slice(0, -1).map(blurTarget);
        down.forEach((t, i) => t.setSize(...sizes[i]));
        up.forEach((t, i) => t.setSize(...sizes[i]));
    };
    resize(size.x, size.y);

    const geometry = new BufferGeometry();
    geometry.setAttribute(
        "position",
        new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3),
    );
    geometry.setAttribute(
        "uv",
        new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2),
    );
    const prefilter = pass(PREFILTER, {
        tSource: null,
        uTexel: new Vector2(),
        uExposure: 1,
        uThreshold: 1,
        uKnee: 0.5,
        uGhostThreshold: 8,
    });
    const downsample = pass(DOWN, { tSource: null, uTexel: new Vector2() });
    const upsample = pass(UP, {
        tSource: null,
        tWider: null,
        uTexel: new Vector2(),
        uSpread: 1,
    });
    const composite = pass(COMPOSITE, {
        tScene: null,
        tBloom: null,
        tGhost: null,
        uStrength: 0,
        uGhost: 0,
        uGhostTint: new Color(),
        uInverseExposure: 1,
    });
    const quad = new Mesh(geometry, prefilter);
    quad.frustumCulled = false;
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const draw = (
        material: RawShaderMaterial,
        target: WebGLRenderTarget | null,
    ) => {
        quad.material = material;
        gl.setRenderTarget(target);
        gl.render(quad, camera);
    };

    let toneMapping: ToneMapping | null = null;
    let colorSpace: string | null = null;
    let ghosts: boolean | null = null;
    const bufferSize = new Vector2();

    const pipeline: PostPipeline = {
        settings,
        sceneTarget,
        render(scene, sceneCamera) {
            const s = pipeline.settings;
            gl.getDrawingBufferSize(bufferSize);
            if (
                bufferSize.x !== sceneTarget.width ||
                bufferSize.y !== sceneTarget.height
            )
                resize(bufferSize.x, bufferSize.y);

            // 1. The scene, in linear light. Rendering to a target, three
            // leaves tone mapping and the color space to the composite.
            gl.setRenderTarget(sceneTarget);
            gl.render(scene, sceneCamera);

            const exposure = gl.toneMappingExposure;
            const glowing = s.strength > 0 || s.ghost > 0;
            if (glowing) {
                // 2. The bright pass.
                const u = prefilter.uniforms;
                u.tSource.value = sceneTarget.texture;
                u.uTexel.value.set(
                    1 / sceneTarget.width,
                    1 / sceneTarget.height,
                );
                u.uExposure.value = exposure;
                u.uThreshold.value = s.threshold;
                u.uKnee.value = s.knee;
                u.uGhostThreshold.value = s.ghostThreshold;
                draw(prefilter, down[0]);
                // 3. Down, then back up.
                for (let i = 1; i < down.length; i++) {
                    downsample.uniforms.tSource.value = down[i - 1].texture;
                    downsample.uniforms.uTexel.value.set(
                        1 / sizes[i - 1][0],
                        1 / sizes[i - 1][1],
                    );
                    draw(downsample, down[i]);
                }
                upsample.uniforms.uSpread.value = s.radius;
                for (let i = up.length - 1; i >= 0; i--) {
                    const wider = i === up.length - 1 ? down[i + 1] : up[i + 1];
                    upsample.uniforms.tSource.value = down[i].texture;
                    upsample.uniforms.tWider.value = wider.texture;
                    upsample.uniforms.uTexel.value.set(
                        1 / sizes[i + 1][0],
                        1 / sizes[i + 1][1],
                    );
                    draw(upsample, up[i]);
                }
            }

            // 4. The composite, with the renderer's tone mapping.
            const withGhosts = glowing && s.ghost > 0;
            if (
                toneMapping !== gl.toneMapping ||
                colorSpace !== gl.outputColorSpace ||
                ghosts !== withGhosts
            ) {
                toneMapping = gl.toneMapping;
                colorSpace = gl.outputColorSpace;
                ghosts = withGhosts;
                const defines: Record<string, string> = {};
                if (ColorManagement.getTransfer(colorSpace) === SRGBTransfer)
                    defines.SRGB_TRANSFER = "";
                const tone = TONE_DEFINES[toneMapping];
                if (tone && toneMapping !== NoToneMapping) defines[tone] = "";
                if (withGhosts) defines.LENS_GHOSTS = "";
                composite.defines = defines;
                composite.needsUpdate = true;
            }
            const c = composite.uniforms;
            const bloom = up[0] ?? down[0];
            // The ghost is a soft disc: the hot light four blur steps down.
            const ghost = down[Math.min(3, down.length - 1)];
            // Each level adds `radius` of the next: keep the sum's weight 1.
            let weight = 0;
            for (let i = 0; i < down.length; i++) weight += s.radius ** i;
            c.tScene.value = sceneTarget.texture;
            c.tBloom.value = bloom.texture;
            c.tGhost.value = ghost.texture;
            c.uStrength.value = glowing ? s.strength / weight : 0;
            c.uGhost.value = s.ghost;
            c.uGhostTint.value.setHex(s.ghostTint);
            c.uInverseExposure.value = 1 / Math.max(exposure, 1e-4);
            draw(composite, null);
        },
        dispose() {
            sceneTarget.dispose();
            [...down, ...up].forEach((t) => t.dispose());
            geometry.dispose();
            [prefilter, downsample, upsample, composite].forEach((m) =>
                m.dispose(),
            );
        },
    };
    return pipeline;
}
