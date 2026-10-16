import {
    BufferAttribute,
    DoubleSide,
    DynamicDrawUsage,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    Mesh,
    ShaderMaterial,
} from "three";
import type { DotPlan, StrokePlan } from "@/field/timelineOverlays";

/**
 * The timeline overlays' two primitives (fork #201): polylines and dots, each
 * in one instanced draw whatever their count (ADR 0005 D-2). Their buffers are
 * persistent: a new plan is written into them in place, and they only grow.
 *
 * Sizes are in "plan units": `unit` field units each, so 1 for sizes in field
 * units (they scale with the zoom) and 1 / zoom for
 * sizes in CSS pixels. Lines and outlines never get thinner than one device
 * pixel; thinner ones are drawn one pixel wide and fade by coverage, as the
 * field's lines do.
 */

const QUAD = new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]);

function quadGeometry(): InstancedBufferGeometry {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(QUAD, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.instanceCount = 0;
    return geometry;
}

/** Instanced attributes that grow by doubling and are rewritten in place. */
class Attributes {
    private capacity = 0;
    readonly arrays: Record<string, Float32Array> = {};

    constructor(
        private readonly geometry: InstancedBufferGeometry,
        private readonly sizes: Record<string, number>,
    ) {}

    /** Room for `count` instances; the arrays keep their contents only when nothing grew. */
    reserve(count: number) {
        // The first call makes the buffers, even for nothing to draw
        if (count <= this.capacity && this.capacity > 0) return;
        // Frees the old buffers; three uploads the new ones on the next draw
        this.geometry.dispose();
        this.capacity = Math.max(64, 2 ** Math.ceil(Math.log2(count)));
        for (const [name, size] of Object.entries(this.sizes)) {
            const array = new Float32Array(this.capacity * size);
            const attribute = new InstancedBufferAttribute(array, size);
            attribute.setUsage(DynamicDrawUsage);
            this.geometry.setAttribute(name, attribute);
            this.arrays[name] = array;
        }
    }

    /** Uploads the first `count` instances. */
    commit(count: number) {
        for (const [name, size] of Object.entries(this.sizes)) {
            const attribute = this.geometry.getAttribute(
                name,
            ) as InstancedBufferAttribute;
            attribute.clearUpdateRanges();
            attribute.addUpdateRange(0, count * size);
            attribute.needsUpdate = true;
        }
        this.geometry.instanceCount = count;
    }
}

const STROKE_VERTEX = /* glsl */ `
attribute vec4 aSeg;    // a.xy, b.xy
attribute vec4 aNear;   // the point before a, the point after b
attribute vec4 aStyle;  // width, dash, gap, distance along the line at a
attribute vec3 aFlags;  // has a point before, has a point after, round ends
attribute vec4 aColor;
uniform float uUnit;    // field units per plan unit
uniform float uPixel;   // one device pixel in field units
varying vec4 vColor;
varying vec2 vLocal;    // along and across the segment, from a, in field units
varying float vLength;
varying float vHalf;
varying vec3 vFlags;
varying vec3 vDash;     // dash, gap, distance at a; in field units
void main() {
    vec2 a = aSeg.xy;
    vec2 b = aSeg.zw;
    vec2 ab = b - a;
    float len = length(ab);
    vec2 dir = len > 0.0 ? ab / len : vec2(1.0, 0.0);
    vec2 normal = vec2(-dir.y, dir.x);
    float width = aStyle.x * uUnit;
    float drawn = max(width, uPixel);
    // Room for the antialiased edge
    float hw = drawn * 0.5 + uPixel;
    bool atB = position.x > 0.5;
    float side = position.y;
    vec2 end = atB ? b : a;
    bool joined = atB ? aFlags.y > 0.5 : aFlags.x > 0.5;
    vec2 other = atB ? normalize(aNear.zw - b) : normalize(a - aNear.xy);
    vec2 sum = dir + other;
    // A path that doubles back has no miter: both ends are drawn free there
    joined = joined && dot(sum, sum) > 1e-6;
    vec2 offset;
    if (joined) {
        // A miter with the neighbor, so joined segments neither overlap nor gap
        vec2 tangent = normalize(sum);
        vec2 miter = vec2(-tangent.y, tangent.x);
        float scale = 1.0 / max(dot(miter, normal), 0.25);
        offset = miter * hw * scale * side;
    } else {
        // A free end: room for a round cap or the antialiased edge
        float cap = aFlags.z > 0.5 ? hw : uPixel;
        offset = normal * hw * side + dir * cap * (atB ? 1.0 : -1.0);
    }
    vec2 p = end + offset;
    vLocal = vec2(dot(p - a, dir), dot(p - a, normal));
    vLength = len;
    vHalf = drawn * 0.5;
    vFlags = aFlags;
    vDash = vec3(aStyle.y * uUnit, aStyle.z * uUnit, aStyle.w * uUnit);
    // Thinner than a pixel: one pixel wide, faded by how much of it the line covers
    vColor = vec4(aColor.rgb, aColor.a * min(1.0, width / uPixel));
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 0.0, 1.0);
}`;

const STROKE_FRAGMENT = /* glsl */ `
uniform float uPixel;
varying vec4 vColor;
varying vec2 vLocal;
varying float vLength;
varying float vHalf;
varying vec3 vFlags;
varying vec3 vDash;
float cover(float inside) {
    return clamp(inside / uPixel + 0.5, 0.0, 1.0);
}
void main() {
    float s = vLocal.x;
    float t = abs(vLocal.y);
    float a = cover(vHalf - t);
    bool round = vFlags.z > 0.5;
    if (s < 0.0 && vFlags.x < 0.5)
        a = round ? cover(vHalf - length(vec2(s, t))) : min(a, cover(s));
    else if (s > vLength && vFlags.y < 0.5)
        a = round ? cover(vHalf - length(vec2(s - vLength, t))) : min(a, cover(vLength - s));
    if (vDash.x > 0.0) {
        float along = mod(vDash.z + s, vDash.x + vDash.y);
        if (along > vDash.x) discard;
    }
    a *= vColor.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb, a);
}`;

const DOT_VERTEX = /* glsl */ `
attribute vec4 aDot;    // x, y, radius, outline width
attribute vec4 aFill;
attribute vec4 aStroke;
uniform float uUnit;
uniform float uPixel;
varying vec2 vLocal;
varying float vRadius;
varying float vHalfStroke;
varying vec4 vFill;
varying vec4 vStroke;
void main() {
    float radius = aDot.z * uUnit;
    float stroke = aDot.w * uUnit;
    float drawnStroke = stroke > 0.0 ? max(stroke, uPixel) : 0.0;
    vRadius = radius;
    vHalfStroke = drawnStroke * 0.5;
    vFill = aFill;
    vStroke = vec4(aStroke.rgb, aStroke.a * (stroke > 0.0 ? min(1.0, stroke / uPixel) : 0.0));
    float extent = radius + vHalfStroke + uPixel;
    vLocal.x = (position.x * 2.0 - 1.0) * extent;
    vLocal.y = position.y * extent;
    gl_Position = projectionMatrix * viewMatrix * vec4(aDot.xy + vLocal, 0.0, 1.0);
}`;

const DOT_FRAGMENT = /* glsl */ `
uniform float uPixel;
varying vec2 vLocal;
varying float vRadius;
varying float vHalfStroke;
varying vec4 vFill;
varying vec4 vStroke;
void main() {
    float d = length(vLocal) - vRadius;
    float fillA = vFill.a * clamp(-d / uPixel + 0.5, 0.0, 1.0);
    float strokeA = vHalfStroke > 0.0
        ? vStroke.a * clamp((vHalfStroke - abs(d)) / uPixel + 0.5, 0.0, 1.0)
        : 0.0;
    // The outline over the fill, as a canvas strokes after it fills
    float a = strokeA + fillA * (1.0 - strokeA);
    if (a < 0.004) discard;
    vec3 rgb = vStroke.rgb * strokeA + vFill.rgb * fillA * (1.0 - strokeA);
    gl_FragColor = vec4(rgb / a, a);
}`;

function material(vertexShader: string, fragmentShader: string) {
    return new ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uUnit: { value: 1 }, uPixel: { value: 1 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
    });
}

/** Sets how big a plan unit and a device pixel are, in field units. */
function setScale(mesh: Mesh, unit: number, pixel: number) {
    const { uniforms } = mesh.material as ShaderMaterial;
    uniforms.uUnit.value = unit;
    uniforms.uPixel.value = pixel;
}

/** Polylines, one instance per segment. */
export class StrokeBatch {
    readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
    private readonly attributes: Attributes;

    constructor() {
        const geometry = quadGeometry();
        this.mesh = new Mesh(
            geometry,
            material(STROKE_VERTEX, STROKE_FRAGMENT),
        );
        this.mesh.frustumCulled = false;
        this.attributes = new Attributes(geometry, {
            aSeg: 4,
            aNear: 4,
            aStyle: 4,
            aFlags: 3,
            aColor: 4,
        });
    }

    /** Draws `strokes` instead of what was drawn. */
    set(strokes: readonly StrokePlan[]) {
        // Repeated points (a hold in a sampled path) would have no direction
        const lines = strokes.map((stroke) => ({
            ...stroke,
            points: withoutRepeats(stroke.points),
        }));
        let count = 0;
        for (const line of lines) count += Math.max(0, line.points.length - 1);
        this.attributes.reserve(count);
        const { aSeg, aNear, aStyle, aFlags, aColor } = this.attributes
            .arrays as Record<string, Float32Array>;
        let i = 0;
        for (const { points, color, width, dash, round } of lines) {
            let distance = 0;
            const last = points.length - 1;
            for (let k = 0; k < last; k++, i++) {
                const a = points[k]!;
                const b = points[k + 1]!;
                const before = points[k - 1] ?? a;
                const after = points[k + 2] ?? b;
                aSeg!.set([a.x, a.y, b.x, b.y], i * 4);
                aNear!.set([before.x, before.y, after.x, after.y], i * 4);
                aStyle!.set(
                    [width, dash?.[0] ?? 0, dash?.[1] ?? 0, distance],
                    i * 4,
                );
                aFlags!.set(
                    [k > 0 ? 1 : 0, k + 1 < last ? 1 : 0, round ? 1 : 0],
                    i * 3,
                );
                aColor!.set(color, i * 4);
                distance += Math.hypot(b.x - a.x, b.y - a.y);
            }
        }
        this.attributes.commit(count);
    }

    setScale(unit: number, pixel: number) {
        setScale(this.mesh, unit, pixel);
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

/** Dots: a fill, and an outline centered on the edge. */
export class DotBatch {
    readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
    private readonly attributes: Attributes;

    constructor() {
        const geometry = quadGeometry();
        this.mesh = new Mesh(geometry, material(DOT_VERTEX, DOT_FRAGMENT));
        this.mesh.frustumCulled = false;
        this.attributes = new Attributes(geometry, {
            aDot: 4,
            aFill: 4,
            aStroke: 4,
        });
    }

    /** Draws `dots` instead of what was drawn. */
    set(dots: readonly DotPlan[]) {
        this.attributes.reserve(dots.length);
        const { aDot, aFill, aStroke } = this.attributes.arrays as Record<
            string,
            Float32Array
        >;
        dots.forEach((dot, i) => {
            aDot!.set([dot.x, dot.y, dot.radius, dot.strokeWidth], i * 4);
            aFill!.set(dot.fill ?? NONE, i * 4);
            aStroke!.set(dot.stroke ?? NONE, i * 4);
        });
        this.attributes.commit(dots.length);
    }

    setScale(unit: number, pixel: number) {
        setScale(this.mesh, unit, pixel);
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

const NONE = [0, 0, 0, 0] as const;

type Point = { readonly x: number; readonly y: number };

/** `points` without any point that repeats the one before it. */
function withoutRepeats(points: readonly Point[]): readonly Point[] {
    const out: Point[] = [];
    for (const p of points) {
        const last = out[out.length - 1];
        if (
            !last ||
            Math.abs(p.x - last.x) > 1e-6 ||
            Math.abs(p.y - last.y) > 1e-6
        )
            out.push(p);
    }
    return out;
}
