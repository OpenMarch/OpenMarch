// cspell:ignore superframe tonemapping
import {
    AdditiveBlending,
    Color,
    Group,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    InstancedMesh,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    PlaneGeometry,
    ShaderMaterial,
    Vector2,
    Vector3,
    type Vector3Tuple,
} from "three";
import { createRng } from "../../environment";
import type { DieselCtx, DieselFrame } from "./frame";

/**
 * The sports lights of the Mark Diesel kit: banks of LED panel fixtures along
 * the catwalk under each superframe, and tight blocks wrapping each corner.
 *
 * None of them is a light. The field is lit by a few spots (`lighting.ts`);
 * these are what the eye sees of the rig.
 *
 * In the photos the row is not a string of equal bulbs. It is a dozen banks
 * of ten to thirteen fixtures with a gap between banks, and no two fixtures
 * look alike, because each is aimed at its own patch of the field: one aimed
 * at the near third shows the audience across the field only the edge of its
 * beam, a small bright square; one aimed at the far third points almost at
 * that audience and burns out to a white core with a wide halo. From behind
 * there is only a dark housing.
 *
 * So each fixture has an aim and a power, and what it shows a camera comes
 * from the angle between its aim and the line to the camera:
 *
 * - a face (a lit panel, for close views);
 * - a core sprite, whose brightness is a narrow beam lobe on top of a little
 *   spill, far over white when the beam is on the camera. It never draws
 *   smaller than a couple of pixels, dimmed to match, so a distant row
 *   doesn't flicker.
 *
 * The wide soft halo and the lens ghosts are the post pass's bloom
 * (`core/post`), which works on these real brightnesses. Low quality has no
 * post pass, so there the sprite carries a halo of its own.
 */

/** How a fixture is aimed: at its own side of the field, or across it. */
export type FixtureKind = "flood" | "throw";

export interface DieselFixture {
    /** Center of the housing, kit-root space. */
    position: Vector3Tuple;
    /** Unit vector the face points along. */
    aim: Vector3Tuple;
    kind: FixtureKind;
    /** Output against a nominal fixture: about 0.75 to 1.25, a few near 0. */
    power: number;
}

/**
 * The fixtures clamp to the front of the rack's lower pipe (`roof.ts`: two
 * pipes at the catwalk height +-0.45 m, 0.9 m to the field side of the
 * superframe's centerline).
 */
const RACK_DROP = 0.45;
const RACK_INSET = 1.3;
/** From a housing back to the pipe. */
const RACK_ARM = RACK_INSET - 0.9;
/** Banks along a run: about one every 10.6 m, as counted in the photos. */
const BANK_PITCH = 10.6;
/** Fixtures in a bank and their spacing. */
const BANK_MIN = 10;
const BANK_SPREAD = 4;
const LAMP_PITCH = 0.64;
/** A corner block: this many fixtures a row, two rows. */
const BLOCK_COLUMNS = 2;
const BLOCK_ROW_DROP = 0.7;

/** Housing, meters: width, height, depth (the face is the +Z side). */
const HOUSING: Vector3Tuple = [0.58, 0.5, 0.26];
const FACE: Vector3Tuple = [0.52, 0.44, 0.03];
const HOUSING_COLOR = 0x121316;

/** The fixtures' white: 5700 K LED, a touch cool next to the warm suites. */
const FACE_COLOR = new Color(0.94, 0.97, 1);
/** The glare reads warm in every photo: about 4300 K on a phone. */
const CORE_COLOR = new Color(1, 0.9, 0.72);
/** A lit face's brightness against white; the core sprite does the rest. */
const FACE_LEVEL = 2.6;
/**
 * The core sprite. `beam` is the half-width of the beam lobe in radians and
 * `peak` its brightness at the center (white is 1); `spill` is what a
 * fixture shows from anywhere in front of it; `sigma` is the core's radius
 * in meters and `minPixels` the least it draws at.
 */
const CORE = { beam: 0.3, peak: 16, spill: 1.2, sigma: 0.2, minPixels: 1.1 };
/**
 * A bank's glare. Across the field a bank's fixtures run together into one
 * round burnt-out disc about as wide as the bank, which is what the photos
 * show: a dozen round halos a side, not a dotted line. One sprite per bank
 * draws that disc: `sigma` is its radius in meters for a full bank, `beam`
 * how far off the bank's aim it still shows, `power` its brightness against
 * a fixture's.
 */
const BANK_GLOW = { sigma: 0.6, beam: 1.1, power: 1.3, full: 11 };
/** The sprite's own halo, where there is no bloom: reach in meters. */
const HALO_REACH = 10;

const unit = (from: Vector3Tuple, to: Vector3Tuple): Vector3Tuple => {
    const v = new Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    v.normalize();
    return [v.x, v.y, v.z];
};

/**
 * Where every fixture hangs, where it points and how hard it burns. Pure
 * (the variation comes from a seeded generator), so tests can count them.
 */
// eslint-disable-next-line max-lines-per-function
export function dieselFixtureLayout(frame: DieselFrame): DieselFixture[] {
    const { CATWALK_RUNS, CATWALK_CORNERS, FIELD_HALF_WIDTH } = frame;
    const { FIELD_HALF_LENGTH } = frame;
    const rnd = createRng(5700);
    const out: DieselFixture[] = [];
    const power = () => (rnd() < 0.05 ? 0.12 : 0.75 + 0.5 * rnd());

    for (const [a, b] of CATWALK_RUNS) {
        const side = Math.sign(a[2]) || 1;
        const y = a[1] - RACK_DROP;
        const z = a[2] - side * RACK_INSET;
        const length = Math.abs(b[0] - a[0]);
        const banks = Math.max(1, Math.round(length / BANK_PITCH));
        const pitch = length / banks;
        const start = Math.min(a[0], b[0]);
        for (let bank = 0; bank < banks; bank++) {
            const center = start + (bank + 0.5) * pitch + (rnd() - 0.5) * 1.2;
            const lamps = BANK_MIN + Math.floor(rnd() * BANK_SPREAD);
            // One or two of a bank throw across the field; most of the
            // others light their own side, a few the middle.
            const throws = new Set<number>();
            const wanted = 1 + (rnd() < 0.45 ? 1 : 0);
            while (throws.size < wanted) throws.add(Math.floor(rnd() * lamps));
            for (let i = 0; i < lamps; i++) {
                const x = center + (i - (lamps - 1) / 2) * LAMP_PITCH;
                const position: Vector3Tuple = [x, y + (rnd() - 0.5) * 0.06, z];
                const kind: FixtureKind = throws.has(i) ? "throw" : "flood";
                // Across the field: 1 is this fixture's own sideline, -1
                // the far one.
                const across =
                    kind === "throw"
                        ? -0.45 - 0.35 * rnd()
                        : rnd() < 0.18
                          ? -0.1 + 0.3 * rnd()
                          : 0.4 + 0.4 * rnd();
                // Along the field the aims cross: a throw can land half a
                // field away from the bank it hangs in, so from any seat a
                // few fixtures in every bank point nearly at the viewer.
                const reach = kind === "throw" ? 1.1 : 0.45;
                const target: Vector3Tuple = [
                    x * 0.6 + (rnd() - 0.5) * reach * FIELD_HALF_LENGTH,
                    0,
                    side * FIELD_HALF_WIDTH * across,
                ];
                out.push({
                    position,
                    aim: unit(position, target),
                    kind,
                    power: power(),
                });
            }
        }
    }

    // The corners: three blocks on the rack past the end of each run, two
    // aimed back down the field's diagonal and one across the end zone.
    for (const [cx, cy, cz] of CATWALK_CORNERS) {
        const sx = Math.sign(cx) || 1;
        const sz = Math.sign(cz) || 1;
        const block = (
            origin: Vector3Tuple,
            step: Vector3Tuple,
            target: Vector3Tuple,
        ) => {
            for (let row = 0; row < 2; row++)
                for (let i = 0; i < BLOCK_COLUMNS; i++) {
                    const position: Vector3Tuple = [
                        origin[0] + step[0] * i,
                        origin[1] - row * BLOCK_ROW_DROP,
                        origin[2] + step[2] * i,
                    ];
                    out.push({
                        position,
                        aim: unit(position, [
                            target[0] + (rnd() - 0.5) * 8,
                            0,
                            target[2] + (rnd() - 0.5) * 6,
                        ]),
                        kind: "throw",
                        power: 0.9 + 0.4 * rnd(),
                    });
                }
        };
        const y = cy - RACK_DROP;
        const z = cz - sz * RACK_INSET;
        const along: Vector3Tuple = [sx * LAMP_PITCH, 0, 0];
        const diagonal: Vector3Tuple = [
            sx * FIELD_HALF_LENGTH * 0.3,
            0,
            -sz * FIELD_HALF_WIDTH * 0.35,
        ];
        block([cx - sx * 5.2, y, z], along, diagonal);
        block([cx - sx * 1.8, y, z], along, diagonal);
        // The last block turns the corner: it lights the end zone.
        block([cx + sx * 1.6, y, z], along, [
            sx * FIELD_HALF_LENGTH * 0.75,
            0,
            -sz * FIELD_HALF_WIDTH * 0.1,
        ]);
    }
    return out;
}

const CORE_VERTEX = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aAim;
attribute float aPower;
attribute float aBeam;
attribute float aSize;
uniform float uLevel;
uniform float uPull;
uniform float uViewportHeight;
uniform float uSpill;
uniform float uPeak;
uniform float uSigma;
uniform float uMinPixels;
uniform float uHalo;
uniform float uHaloReach;
varying vec2 vUv;
varying float vCore;
varying float vHalo;
varying float vRadius;

void main() {
    vec4 world = modelMatrix * vec4(aCenter, 1.0);
    vec3 toCamera = normalize(cameraPosition - world.xyz);
    float facing = dot(normalize(mat3(modelMatrix) * aAim), toCamera);
    // Nothing from behind or edge-on; a narrow lobe around the aim.
    float seen = smoothstep(0.03, 0.3, facing);
    float angle = acos(clamp(facing, -1.0, 1.0));
    float beam = exp(-angle * angle / (aBeam * aBeam));
    float gain = uLevel * aPower * seen;

    vec4 mv = viewMatrix * world;
    mv.xyz += normalize(-mv.xyz) * min(uPull, length(mv.xyz) * 0.5);
    // The core never draws smaller than a pixel or so, and one whose beam
    // is on the camera never smaller than two: a camera's sensor floods
    // around a lamp however small the lamp is in the frame, so the halo
    // keeps its size in a wide shot. Past a third of that size it dims, to
    // keep a far row from burning as bright as a near one.
    float pixel = -mv.z * 2.0 / (projectionMatrix[1][1] * uViewportHeight);
    float own = uSigma * aSize;
    float sigma = max(own, uMinPixels * pixel * (1.0 + beam));
    float squeeze = min(1.0, 3.0 * own / sigma);
    vCore = gain * (uSpill + uPeak * beam) * squeeze * squeeze;
    // Without bloom the sprite carries a halo, wider as the beam turns to
    // the camera.
    float reach = uHalo * uHaloReach * (0.25 + 0.75 * beam);
    vHalo = gain * uHalo * 1.8 * beam;
    float radius = max(3.2 * sigma, reach);
    vRadius = radius / sigma;
    mv.xy += position.xy * radius;
    vUv = position.xy;
    gl_Position = projectionMatrix * mv;
}
`;

const CORE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTight;
varying vec2 vUv;
varying float vCore;
varying float vHalo;
varying float vRadius;

void main() {
    float r = length(vUv);
    if (r >= 1.0 || vCore <= 0.0) discard;
    // In core radii.
    float s = r * vRadius;
    float core = vCore * exp(-0.5 * uTight * s * s);
    // A long soft tail, gone by the quad's edge.
    float tail = 1.0 / (1.0 + 18.0 * r * r);
    float halo = vHalo * tail * tail * smoothstep(1.0, 0.55, r);
    gl_FragColor = vec4(uColor * (core + halo), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;

export interface DieselFixtures {
    /** Housings, faces and cores, in kit-root space. */
    object: Group;
    /** How many fixtures hang on the catwalks. */
    count: number;
    /**
     * `level` is 1 with the rig on and near 0 by day: it drives the faces'
     * brightness and the cores (hidden below 0.2, when the lamps only idle).
     */
    setLevel(level: number): void;
    /**
     * Hides the fixtures under the roof halves `half(s)` says are cut away
     * (`cutaway.ts`), with their housings and glare.
     */
    setCut(half: (s: number) => boolean): void;
    dispose(): void;
}

const dummy = new Object3D();

/** A box of `size` on a fixture, pushed `forward` along its aim. */
function fixtureMatrix(
    f: DieselFixture,
    size: Vector3Tuple,
    forward: number,
): Matrix4 {
    const [x, y, z] = f.position;
    const [ax, ay, az] = f.aim;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.lookAt(x + ax, y + ay, z + az);
    dummy.position.set(x + ax * forward, y + ay * forward, z + az * forward);
    dummy.scale.set(...size);
    dummy.updateMatrix();
    return dummy.matrix;
}

/**
 * The housings and the arm that clamps each to the rack's pipe behind it:
 * one instanced mesh. The pipes are the roof part's.
 */
function buildHousings(ctx: DieselCtx, layout: DieselFixture[]): InstancedMesh {
    const { shared } = ctx;
    const housings = new InstancedMesh(
        shared.unitBox,
        shared.std(HOUSING_COLOR, { roughness: 0.6, metalness: 0.3 }),
        layout.length * 2,
    );
    housings.name = "markDiesel.fixtureHousings";
    layout.forEach((f, i) => {
        housings.setMatrixAt(i, fixtureMatrix(f, HOUSING, 0));
        const [x, y, z] = f.position;
        const side = Math.sign(z) || 1;
        dummy.position.set(x, y, z + (side * RACK_ARM) / 2);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(0.07, 0.07, RACK_ARM);
        dummy.updateMatrix();
        housings.setMatrixAt(layout.length + i, dummy.matrix);
    });
    housings.instanceMatrix.needsUpdate = true;
    housings.computeBoundingSphere();
    return housings;
}

/** What one core sprite draws: a fixture, or a whole bank's glare. */
interface CoreSprite {
    center: Vector3Tuple;
    aim: Vector3Tuple;
    power: number;
    beam: number;
    size: number;
}

/**
 * One glare sprite per bank or corner block: the middle of each run of
 * neighboring fixtures, aimed at the far side's lower seats. Pure.
 */
export function dieselBankGlows(layout: DieselFixture[]): CoreSprite[] {
    const out: CoreSprite[] = [];
    let from = 0;
    for (let i = 1; i <= layout.length; i++) {
        const prev = layout[i - 1].position;
        const next = layout[i]?.position;
        if (
            next &&
            Math.hypot(next[0] - prev[0], next[2] - prev[2]) < LAMP_PITCH * 2
        )
            continue;
        const group = layout.slice(from, i);
        from = i;
        const center: Vector3Tuple = [0, 0, 0];
        for (const f of group)
            f.position.forEach((p, k) => (center[k] += p / group.length));
        const side = Math.sign(center[2]) || 1;
        out.push({
            center,
            aim: unit(center, [center[0] * 0.4, 8, -side * 34]),
            power: BANK_GLOW.power,
            beam: BANK_GLOW.beam,
            size:
                (BANK_GLOW.sigma / CORE.sigma) *
                Math.sqrt(group.length / BANK_GLOW.full),
        });
    }
    return out;
}

/**
 * The cores: one camera-facing quad per fixture and one per bank, added
 * over the picture.
 */
// eslint-disable-next-line max-lines-per-function
function buildCores(layout: DieselFixture[], bloom: boolean) {
    const quad = new PlaneGeometry(2, 2);
    const geometry = new InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));
    // Each fixture's quad sits on its face.
    const out = HOUSING[2] / 2 + FACE[2];
    const sprites: CoreSprite[] = [
        ...layout.map((f) => ({
            center: f.position.map(
                (p, i) => p + f.aim[i] * out,
            ) as Vector3Tuple,
            aim: f.aim,
            power: f.power,
            beam: CORE.beam,
            size: 1,
        })),
        ...dieselBankGlows(layout),
    ];
    geometry.instanceCount = sprites.length;
    const attribute = (values: number[], size: number) =>
        new InstancedBufferAttribute(new Float32Array(values), size);
    geometry.setAttribute(
        "aCenter",
        attribute(
            sprites.flatMap((f) => f.center),
            3,
        ),
    );
    geometry.setAttribute(
        "aAim",
        attribute(
            sprites.flatMap((f) => f.aim),
            3,
        ),
    );
    const scalar = (pick: (f: CoreSprite) => number) =>
        attribute(sprites.map(pick), 1);
    geometry.setAttribute(
        "aPower",
        scalar((f) => f.power),
    );
    geometry.setAttribute(
        "aBeam",
        scalar((f) => f.beam),
    );
    geometry.setAttribute(
        "aSize",
        scalar((f) => f.size),
    );
    const material = new ShaderMaterial({
        uniforms: {
            uColor: { value: CORE_COLOR.clone() },
            uLevel: { value: 0 },
            // Toward the camera, over the pipes and yokes around it.
            uPull: { value: 0.7 },
            uViewportHeight: { value: 1080 },
            uSpill: { value: CORE.spill },
            uPeak: { value: CORE.peak },
            uSigma: { value: CORE.sigma },
            uMinPixels: { value: CORE.minPixels },
            // The bloom pass makes the halo where there is one.
            uHalo: { value: bloom ? 0.3 : 1 },
            // Tighter than a true Gaussian, so the dots of a bank stay
            // apart; more so without the post pass, where the sprites add
            // up after tone mapping, which fattens them.
            uTight: { value: bloom ? 2.2 : 3 },
            uHaloReach: { value: HALO_REACH },
        },
        vertexShader: CORE_VERTEX,
        fragmentShader: CORE_FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
    });
    const power = geometry.getAttribute("aPower") as InstancedBufferAttribute;
    const powers = Float32Array.from(power.array);
    const sides = sprites.map((f) => Math.sign(f.center[2]) || 1);
    const mesh = new Mesh(geometry, material);
    mesh.name = "markDiesel.fixtureGlare";
    // The quads are placed in the shader, so the geometry has no bounds.
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    const size = new Vector2();
    mesh.onBeforeRender = (renderer) => {
        const target = renderer.getRenderTarget();
        material.uniforms.uViewportHeight.value = target
            ? target.height
            : renderer.getDrawingBufferSize(size).y;
    };
    return {
        mesh,
        material,
        /** Zeroes the glare of sprites on the hidden sides. */
        hide(hidden: (side: number) => boolean) {
            sides.forEach((side, i) =>
                power.setX(i, hidden(side) ? 0 : powers[i]),
            );
            power.needsUpdate = true;
        },
        dispose() {
            quad.dispose();
            geometry.dispose();
            material.dispose();
        },
    };
}

/**
 * Builds the fixtures: at high quality three draw calls (housings with
 * their clamp arms, faces, cores); at low quality two (faces, cores).
 */
export function buildDieselFixtures(ctx: DieselCtx): DieselFixtures {
    const { frame, shared, quality } = ctx;
    const high = quality === "high";
    const layout = dieselFixtureLayout(frame);
    const object = new Group();
    object.name = "markDiesel.fixtures";

    const housings = high ? buildHousings(ctx, layout) : null;
    if (housings) object.add(housings);

    // Faces: unlit, so they stay white-hot whatever lights the hall. Each
    // instance's color is its fixture's power.
    const faceMat = new MeshBasicMaterial({ color: 0x000000, fog: false });
    const faces = new InstancedMesh(shared.unitBox, faceMat, layout.length);
    faces.name = "markDiesel.fixtureFaces";
    const tint = new Color();
    layout.forEach((f, i) => {
        faces.setMatrixAt(i, fixtureMatrix(f, FACE, HOUSING[2] / 2));
        faces.setColorAt(i, tint.setScalar(0.25 + 0.75 * f.power));
    });
    faces.instanceMatrix.needsUpdate = true;
    if (faces.instanceColor) faces.instanceColor.needsUpdate = true;
    faces.computeBoundingSphere();
    object.add(faces);

    const cores = buildCores(layout, high);
    object.add(cores.mesh);

    object.traverse((o) => {
        o.castShadow = false;
        o.receiveShadow = false;
    });

    // The cutaway hides instances by scaling them to nothing; the built
    // matrices are kept to bring them back.
    const meshes = [housings, faces].filter((m): m is InstancedMesh => !!m);
    const kept = meshes.map((m) => Float32Array.from(m.instanceMatrix.array));
    // Housings hold each fixture's arm after all the housings.
    const sideOf = (i: number) =>
        Math.sign(layout[i % layout.length].position[2]) || 1;
    let cutKey = "";
    const setCut = (half: (s: number) => boolean) => {
        const key = `${half(1)}${half(-1)}`;
        if (key === cutKey) return;
        cutKey = key;
        meshes.forEach((m, k) => {
            const array = m.instanceMatrix.array as Float32Array;
            for (let i = 0; i < m.count; i++) {
                const at = i * 16;
                if (half(sideOf(i))) {
                    // Scaled to nothing, but still an affine matrix
                    // (w = 1): an all-zero one makes the mesh's bounds NaN.
                    array.fill(0, at, at + 15);
                    array[at + 15] = 1;
                } else array.set(kept[k].subarray(at, at + 16), at);
            }
            m.instanceMatrix.needsUpdate = true;
        });
        cores.hide(half);
        object.visible = !(half(1) && half(-1));
    };
    setCut(() => false);

    return {
        object,
        count: layout.length,
        setCut,
        setLevel(level) {
            faceMat.color
                .copy(FACE_COLOR)
                .multiplyScalar(0.04 + level * FACE_LEVEL);
            cores.material.uniforms.uLevel.value = level;
            cores.mesh.visible = level >= 0.2;
        },
        dispose() {
            housings?.dispose();
            faces.dispose();
            faceMat.dispose();
            cores.dispose();
        },
    };
}
