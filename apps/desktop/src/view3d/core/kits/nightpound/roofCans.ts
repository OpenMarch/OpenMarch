// cspell:ignore tonemapping
import {
    AdditiveBlending,
    CircleGeometry,
    Color,
    Group,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    PlaneGeometry,
    ShaderMaterial,
    Vector2,
} from "three";
import { CAN, canLayout, type CanLight } from "./roofPlan";

/**
 * Nightpound's house lights as the eye sees them: round white faces hung in
 * a grid under the trusses, each with a soft halo. That grid of bright dots
 * on black steel is the look of the hall in every photo.
 *
 * None of them is a light; the floor is lit by a few spots (`lighting.ts`).
 * Two draw calls: the faces (unlit discs, for close views) and the glare (a
 * camera-facing quad per can, added over the picture, which never draws
 * smaller than a pixel or so, so a far row doesn't flicker). The housings
 * are the roof's (`roof.ts`).
 */

/** 5000 K LED: white, a touch warm in the halo. */
const FACE_COLOR = new Color(1, 0.98, 0.94);
const GLARE_COLOR = new Color(1, 0.95, 0.86);
/** A lit face's brightness against white. */
const FACE_LEVEL = 3;
/**
 * The glare. A can points straight down, so `peak` is what a camera right
 * under it gets and `spill` what one far across the hall gets from the edge
 * of the lens; `sigma` is the core's radius in meters, `minPixels` the least
 * it draws at and `halo` the reach of the soft tail in meters.
 */
const GLARE = { spill: 1.5, peak: 5, sigma: 0.19, minPixels: 1.05, halo: 1.5 };

const VERTEX = /* glsl */ `
attribute vec3 aCenter;
attribute float aPower;
uniform float uLevel;
uniform float uViewportHeight;
uniform float uSpill;
uniform float uPeak;
uniform float uSigma;
uniform float uMinPixels;
uniform float uHalo;
varying vec2 vUv;
varying float vCore;
varying float vHalo;
varying float vRadius;

void main() {
    vec4 world = modelMatrix * vec4(aCenter, 1.0);
    vec3 toCamera = normalize(cameraPosition - world.xyz);
    // The face looks straight down: nothing from above it.
    float facing = -toCamera.y;
    float seen = smoothstep(0.0, 0.07, facing);
    float gain = uLevel * aPower * seen;

    vec4 mv = viewMatrix * world;
    // Toward the camera, over the housing's rim.
    mv.xyz += normalize(-mv.xyz) * min(0.4, length(mv.xyz) * 0.5);
    float pixel = -mv.z * 2.0 / (projectionMatrix[1][1] * uViewportHeight);
    float sigma = max(uSigma, uMinPixels * pixel);
    // A core stretched to a pixel dims, so a far row isn't a near one.
    float squeeze = min(1.0, 2.2 * uSigma / sigma);
    vCore = gain * (uSpill + uPeak * facing * facing) * squeeze;
    vHalo = gain * 0.35 * (0.4 + facing);
    float radius = max(3.2 * sigma, uHalo);
    vRadius = radius / sigma;
    mv.xy += position.xy * radius;
    vUv = position.xy;
    gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vCore;
varying float vHalo;
varying float vRadius;

void main() {
    float r = length(vUv);
    if (r >= 1.0 || vCore <= 0.0) discard;
    float s = r * vRadius;
    float core = vCore * exp(-1.2 * s * s);
    // A long soft tail, gone by the quad's edge.
    float tail = 1.0 / (1.0 + 30.0 * r * r);
    float halo = vHalo * tail * tail * smoothstep(1.0, 0.5, r);
    gl_FragColor = vec4(uColor * (core + halo), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export interface NightpoundCans {
    object: Group;
    layout: CanLight[];
    /** 1 with the lamps on; 0 is dark faces and no glare. */
    setLevel(level: number): void;
    dispose(): void;
}

/** The glare: one camera-facing quad per can, added over the picture. */
function buildGlare(layout: CanLight[]) {
    const quad = new PlaneGeometry(2, 2);
    const geometry = new InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));
    geometry.instanceCount = layout.length;
    geometry.setAttribute(
        "aCenter",
        new InstancedBufferAttribute(
            new Float32Array(layout.flatMap((c) => c.position)),
            3,
        ),
    );
    // The lamps over the floor are the brighter ones.
    geometry.setAttribute(
        "aPower",
        new InstancedBufferAttribute(
            new Float32Array(layout.map((c) => (c.floor ? 1 : 0.7))),
            1,
        ),
    );
    const glareMat = new ShaderMaterial({
        uniforms: {
            uColor: { value: GLARE_COLOR.clone() },
            uLevel: { value: 0 },
            uViewportHeight: { value: 1080 },
            uSpill: { value: GLARE.spill },
            uPeak: { value: GLARE.peak },
            uSigma: { value: GLARE.sigma },
            uMinPixels: { value: GLARE.minPixels },
            uHalo: { value: GLARE.halo },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
    });
    const glare = new Mesh(geometry, glareMat);
    glare.name = "nightpound.canGlare";
    // The quads are placed in the shader, so the geometry has no bounds.
    glare.frustumCulled = false;
    glare.renderOrder = 3;
    const size = new Vector2();
    glare.onBeforeRender = (renderer) => {
        const target = renderer.getRenderTarget();
        glareMat.uniforms.uViewportHeight.value = target
            ? target.height
            : renderer.getDrawingBufferSize(size).y;
    };
    return {
        mesh: glare,
        material: glareMat,
        dispose() {
            quad.dispose();
            geometry.dispose();
            glareMat.dispose();
        },
    };
}

export function buildCans(quality: "low" | "high"): NightpoundCans {
    const layout = canLayout();
    const object = new Group();
    object.name = "nightpound.cans";

    // Faces: unlit, so they stay white whatever lights the hall.
    const disc = new CircleGeometry(
        CAN.radius * 0.9,
        quality === "high" ? 14 : 8,
    );
    disc.rotateX(Math.PI / 2);
    const faceMat = new MeshBasicMaterial({ color: 0x000000, fog: false });
    const faces = new InstancedMesh(disc, faceMat, layout.length);
    faces.name = "nightpound.canFaces";
    const m = new Matrix4();
    layout.forEach(({ position: [x, y, z] }, i) =>
        faces.setMatrixAt(i, m.makeTranslation(x, y, z)),
    );
    faces.instanceMatrix.needsUpdate = true;
    faces.computeBoundingSphere();
    object.add(faces);

    const glow = buildGlare(layout);
    const glare = glow.mesh;
    const glareMat = glow.material;
    object.add(glare);

    return {
        object,
        layout,
        setLevel(level) {
            faceMat.color
                .copy(FACE_COLOR)
                .multiplyScalar(0.05 + level * FACE_LEVEL);
            glareMat.uniforms.uLevel.value = level;
            glare.visible = level > 0.05;
        },
        dispose() {
            disc.dispose();
            faces.dispose();
            faceMat.dispose();
            glow.dispose();
        },
    };
}
