import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
    BufferAttribute,
    DoubleSide,
    DynamicDrawUsage,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    Mesh,
    ShaderMaterial,
} from "three";
import type { FieldTheme } from "@openmarch/core";
import type { FieldMarchers } from "../fieldMarchers";
import {
    NOT_DEFINED_LOOK,
    notDefinedAmount,
    type FieldNotDefined,
} from "../fieldNotDefined";
import type { FieldDimming } from "../fieldDimming";
import { useFieldDraw } from "../fieldDrawContext";
import { MARCHER_SHAPE, writeMarcherLooks } from "../marcherLooks";
import { dotSizes, SELECTION_RGBA01 } from "../selectionRing";

/**
 * Every marcher's dot in one instanced draw, shaded in the fragment shader so
 * edges are smooth without MSAA (ADR 0005 D-2). Each instance carries its look
 * (fill, outline, shape; `marcherLooks.ts`). Dots sit exactly on their
 * positions: no half-grid-line offset.
 *
 * Shapes are signed distances in field units, sized as the drill-chart export
 * draws them (`drillChartSvg.ts`'s `dotSvg`): a circle of
 * radius 5, a square of side 5·√π·1.2, an equilateral triangle 12 wide, and an
 * X of two 2-wide lines out to ±6. The 1-unit outline straddles the edge, and
 * corners are mitered.
 *
 * A selected marcher (#193) gets a ring a little outside its shape's edge, in
 * the same draw.
 */
const VERTEX = /* glsl */ `
attribute vec2 aPos;
attribute vec4 aFill;
attribute vec4 aOutline;
attribute float aShape;
attribute float aOpacity;
attribute float aNotDefined;
attribute float aSelected;
uniform float uScale;
uniform float uMargin;
uniform float uRingOuter;
varying vec2 vLocal;
varying vec4 vFill;
varying vec4 vOutline;
varying float vShape;
varying float vOpacity;
varying float vNotDefined;
varying float vSelected;
void main() {
    vSelected = aSelected;
    vNotDefined = aNotDefined;
    vFill = aFill;
    vOutline = aOutline;
    vOpacity = aOpacity;
    vShape = aShape;
    if (aShape < -0.5) {
        // Hidden: every corner on one point outside the view draws nothing
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        return;
    }
    // The largest shape (the X's line ends) and its ring, plus a margin for the antialiased edge
    vLocal = position.xy * (7.0 + aSelected * uRingOuter + uMargin);
    gl_Position = projectionMatrix * viewMatrix * vec4(aPos + vLocal * uScale, 0.0, 1.0);
}`;

const L = NOT_DEFINED_LOOK;
const FRAGMENT = /* glsl */ `
#define DOT_R 5.0
#define PI 3.14159265
#define NOT_DEFINED_FILL ${L.fillOpacity.toFixed(3)}
#define EDGE_WIDTH ${L.edgeWidth.toFixed(3)}
#define MIN_EDGE_PX ${L.minEdgePx.toFixed(3)}
#define CIRCLE_DASHES ${L.circleDashes.toFixed(1)}
#define SIDE_DASHES ${L.sideDashes.toFixed(1)}
#define SMALL_CIRCLE_DASHES ${L.smallCircleDashes.toFixed(1)}
#define SMALL_SIDE_DASHES ${L.smallSideDashes.toFixed(1)}
#define FEW_DASHES_BELOW_PX ${L.fewDashesBelowPx.toFixed(3)}
#define MIN_GAP_PX ${L.minGapPx.toFixed(3)}
#define GAP ${L.gap.toFixed(3)}
varying vec2 vLocal;
varying vec4 vFill;
varying vec4 vOutline;
varying float vShape;
varying float vOpacity;
varying float vNotDefined;
varying float vSelected;
uniform vec4 uRing;
uniform float uRingInner;
uniform float uRingOuter;
uniform float uMargin;

float squareHalf() { return DOT_R * sqrt(PI) * 0.6; }
float square(vec2 p) {
    vec2 q = abs(p);
    return max(q.x, q.y) - squareHalf();
}
// Corners (-hw, hh), (0, -hh), (hw, hh), y down
float triangleHw() { return DOT_R * 1.2; }
float triangleHh() { return triangleHw() * sqrt(3.0) * 0.5; }
float triangleSlant(vec2 p) {
    float hw = triangleHw();
    float hh = triangleHh();
    return dot(vec2(abs(p.x), p.y + hh), normalize(vec2(2.0 * hh, -hw)));
}
float triangle(vec2 p) {
    return max(triangleSlant(p), p.y - triangleHh());
}
float xMark(vec2 p) {
    // Both lines folded onto one: from the center out to (s, s), 1 unit either side
    vec2 q = abs(p);
    float s = DOT_R * 1.2;
    float along = (q.x + q.y) * 0.70710678;
    float across = abs(q.x - q.y) * 0.70710678;
    return max(along - s * 1.41421356, across - 1.0);
}

/**
 * Where a point on the shape's edge (or an X's arm) falls among its dashes, in
 * dashes: a gap is centered on each whole number between them. A circle has
 * 'circle' dashes all round; a square's or triangle's side, and an X's arm,
 * has 'side' from corner to corner, so corners stay solid.
 */
float dashPosition(vec2 p, float shape, float circle, float side) {
    if (shape < 0.5) return (atan(p.y, p.x) / (2.0 * PI) + 0.5) * circle;
    float u;
    if (shape < 1.5) {
        vec2 q = abs(p);
        u = (q.x > q.y ? p.y : p.x) / squareHalf();
    } else if (shape < 2.5) {
        float hh = triangleHh();
        u = triangleSlant(p) > p.y - hh ? p.y / hh : p.x / triangleHw();
    } else {
        vec2 q = abs(p);
        u = (q.x + q.y) / (DOT_R * 1.2 * 2.0) * 2.0 - 1.0;
    }
    return (u * 0.5 + 0.5) * side;
}

/**
 * 1 on a dash, 0 in a gap, for a look 'amount' of the way to Not defined (0 is
 * solid). A shape too small on screen for its usual dashes gets fewer, longer
 * ones, and a gap is never under MIN_GAP_PX, so the gaps always show.
 */
float dashed(vec2 p, float shape, float amount) {
    if (amount < 0.001) return 1.0;
    bool small = DOT_R / uMargin < FEW_DASHES_BELOW_PX;
    float side = small ? SMALL_SIDE_DASHES : SIDE_DASHES;
    float k = dashPosition(p, shape, small ? SMALL_CIRCLE_DASHES : CIRCLE_DASHES, side);
    float center = shape < 0.5 ? floor(k + 0.5) : clamp(floor(k + 0.5), 1.0, side - 1.0);
    float off = abs(k - center);
    // fwidth(k) is a pixel, in dashes
    float fw = fwidth(k);
    float gapHalf = amount * min(max(0.5 * GAP, 0.5 * MIN_GAP_PX * fw), 0.35);
    return smoothstep(gapHalf - 0.5 * fw, gapHalf + 0.5 * fw, off);
}

void main() {
    float d;
    if (vShape < 0.5) d = length(vLocal) - DOT_R;
    else if (vShape < 1.5) d = square(vLocal);
    else if (vShape < 2.5) d = triangle(vLocal);
    else d = xMark(vLocal);
    float aa = 0.5 * fwidth(d);
    float fill = 1.0 - smoothstep(-aa, aa, d);
    float fillA = vFill.a * fill;
    // An X is its lines only; the others are a fill with the outline drawn over it
    float stroke = vShape > 2.5 ? 0.0 : 1.0 - smoothstep(0.5 - aa, 0.5 + aa, abs(d));
    float strokeA = vOutline.a * stroke;
    vec3 strokeRgb = vOutline.rgb;

    // Not defined (#300, #478): the edge dashed at full strength, at any size. The
    // amount eases 0 to 1 on Stop (#302): the gaps open from a solid edge
    float amount = vNotDefined;
    if (amount > 0.0) {
        float on = dashed(vLocal, vShape, amount);
        float width = mix(1.0, max(EDGE_WIDTH, MIN_EDGE_PX * uMargin), amount);
        if (vShape > 2.5) {
            // An X dashes its own lines, at full strength
            fillA *= on;
        } else if (vOutline.a >= 0.1) {
            // The outline, widened inward and dashed, round the fill at 60%
            fillA *= mix(1.0, NOT_DEFINED_FILL, amount);
            float band = 1.0 - smoothstep(0.5 * width - aa, 0.5 * width + aa, abs(d - 0.5 + 0.5 * width));
            strokeA = vOutline.a * band * on;
        } else {
            // No outline: only the edge, dashed in the fill's color, with nothing inside
            fillA *= 1.0 - amount;
            float band = 1.0 - smoothstep(0.5 * width - aa, 0.5 * width + aa, abs(d + 0.5 * width));
            strokeRgb = vFill.rgb;
            strokeA = vFill.a * band * on;
        }
    }
    float dotA = strokeA + fillA * (1.0 - strokeA);
    vec3 dotRgb = strokeRgb * strokeA + vFill.rgb * fillA * (1.0 - strokeA);
    // The selection ring, between uRingInner and uRingOuter outside the shape's edge
    float ringA = vSelected * uRing.a
        * (smoothstep(uRingInner - aa, uRingInner + aa, d)
            - smoothstep(uRingOuter - aa, uRingOuter + aa, d));
    // A dimmed marcher's dot (#201) fades; a selection ring stays full strength
    dotA *= vOpacity;
    dotRgb *= vOpacity;
    float a = dotA + ringA * (1.0 - dotA);
    if (a < 0.004) discard;
    vec3 rgb = dotRgb + uRing.rgb * ringA * (1.0 - dotA);
    gl_FragColor = vec4(rgb / a, a);
}`;

type Drawn = {
    version: number;
    idsVersion: number;
    appearanceVersion: number;
    dimVersion: number;
    lookVersion: number;
    selectionVersion: number;
    theme: FieldTheme | null;
};

/** The marchers' dots, each in its appearance at the beat drawn, with a ring on each selected one. */
export default function MarchersLayer({
    marchers,
    dimming,
    look,
    theme,
}: {
    marchers: FieldMarchers;
    /** Marchers drawn dimmed (#201). */
    dimming: FieldDimming;
    /** Marchers drawn Not defined (#478, `NOT_DEFINED_LOOK`); dimming wins. */
    look: FieldNotDefined;
    theme: FieldTheme;
}) {
    const invalidate = useThree((s) => s.invalidate);
    const draw = useFieldDraw();
    const drawn = useRef<Drawn>({
        version: -1,
        idsVersion: -1,
        appearanceVersion: -1,
        dimVersion: -1,
        lookVersion: -1,
        selectionVersion: -1,
        theme: null,
    });

    const mesh = useMemo(() => {
        const geometry = new InstancedBufferGeometry();
        geometry.setAttribute(
            "position",
            new BufferAttribute(
                new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
                3,
            ),
        );
        geometry.setIndex([0, 1, 2, 0, 2, 3]);
        geometry.instanceCount = 0;
        const dots = new Mesh(
            geometry,
            new ShaderMaterial({
                vertexShader: VERTEX,
                fragmentShader: FRAGMENT,
                uniforms: {
                    uScale: { value: 1 },
                    uMargin: { value: 1 },
                    uRing: { value: SELECTION_RGBA01 },
                    uRingInner: { value: 1 },
                    uRingOuter: { value: 2 },
                },
                transparent: true,
                depthTest: false,
                depthWrite: false,
                side: DoubleSide,
            }),
        );
        dots.frustumCulled = false;
        dots.renderOrder = 2;
        return dots;
    }, []);

    // A new theme restyles the dots on the next frame
    useEffect(() => invalidate(), [theme, invalidate]);
    // New dimming redraws them on the next frame
    useEffect(() => dimming.subscribe(invalidate), [dimming, invalidate]);
    useEffect(() => look.subscribe(invalidate), [look, invalidate]);

    useEffect(
        () => () => {
            mesh.geometry.dispose();
            mesh.material.dispose();
        },
        [mesh],
    );

    useFrame(() => {
        const { zoom } = draw.view.getState();
        const { scale, ringGap, ringWidth } = dotSizes(zoom);
        const { uniforms } = mesh.material;
        uniforms.uScale.value = scale;
        // In the shape's own units, as the edge distance `d`
        uniforms.uRingInner.value = ringGap / scale;
        uniforms.uRingOuter.value = (ringGap + ringWidth) / scale;
        // One CSS pixel, in the shape's own units
        uniforms.uMargin.value = 1 / (zoom * scale);

        const last = drawn.current;
        const resized = marchers.idsVersion !== last.idsVersion;
        const restyled =
            resized ||
            marchers.appearanceVersion !== last.appearanceVersion ||
            theme !== last.theme;
        const dimChanged =
            resized ||
            dimming.version !== last.dimVersion ||
            look.version !== last.lookVersion;
        const reselected =
            resized || marchers.selectionVersion !== last.selectionVersion;
        if (
            !resized &&
            !restyled &&
            !dimChanged &&
            !reselected &&
            marchers.version === last.version
        )
            return;
        const geometry = mesh.geometry;
        if (resized || !geometry.getAttribute("aPos")) {
            // Frees the old buffers; three uploads the new ones on the next draw
            geometry.dispose();
            const n = marchers.ids.length;
            const dynamic = (array: Float32Array, size: number) => {
                const a = new InstancedBufferAttribute(array, size);
                a.setUsage(DynamicDrawUsage);
                return a;
            };
            geometry.setAttribute("aPos", dynamic(new Float32Array(n * 2), 2));
            geometry.setAttribute("aFill", dynamic(new Float32Array(n * 4), 4));
            geometry.setAttribute(
                "aOutline",
                dynamic(new Float32Array(n * 4), 4),
            );
            geometry.setAttribute("aShape", dynamic(new Float32Array(n), 1));
            geometry.setAttribute("aOpacity", dynamic(new Float32Array(n), 1));
            geometry.setAttribute(
                "aNotDefined",
                dynamic(new Float32Array(n), 1),
            );
            geometry.setAttribute("aSelected", dynamic(new Float32Array(n), 1));
            geometry.instanceCount = n;
        }
        const instanced = (name: string) =>
            geometry.getAttribute(name) as InstancedBufferAttribute;
        if (restyled) {
            const fill = instanced("aFill");
            const outline = instanced("aOutline");
            const shape = instanced("aShape");
            writeMarcherLooks(marchers.stacks, theme, {
                fill: fill.array as Float32Array,
                outline: outline.array as Float32Array,
                shape: shape.array as Float32Array,
            });
            // Items are drawn as their Outlines by the items layer, not as dots
            const shapes = shape.array as Float32Array;
            marchers.isItem.forEach((item, i) => {
                if (item) shapes[i] = MARCHER_SHAPE.hidden;
            });
            fill.needsUpdate = true;
            outline.needsUpdate = true;
            shape.needsUpdate = true;
        }
        if (dimChanged) {
            const opacity = instanced("aOpacity");
            const notDefinedLook = instanced("aNotDefined");
            const opacities = opacity.array as Float32Array;
            const amounts = notDefinedLook.array as Float32Array;
            marchers.ids.forEach((id, i) => {
                opacities[i] = dimming.opacityOf(id);
                amounts[i] = notDefinedAmount(dimming, look, id);
            });
            opacity.needsUpdate = true;
            notDefinedLook.needsUpdate = true;
        }
        if (reselected) {
            const selected = instanced("aSelected");
            (selected.array as Float32Array).set(marchers.selected);
            selected.needsUpdate = true;
        }
        const positions = instanced("aPos");
        (positions.array as Float32Array).set(marchers.positions);
        positions.needsUpdate = true;
        drawn.current = {
            version: marchers.version,
            idsVersion: marchers.idsVersion,
            appearanceVersion: marchers.appearanceVersion,
            dimVersion: dimming.version,
            lookVersion: look.version,
            selectionVersion: marchers.selectionVersion,
            theme,
        };
    });

    return <primitive object={mesh} />;
}
