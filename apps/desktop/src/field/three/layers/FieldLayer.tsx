import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
    BufferAttribute,
    DoubleSide,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    Mesh,
    ShaderMaterial,
} from "three";
import type { FieldProperties } from "@openmarch/core";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { fieldGeometry, rgba01, type FieldRects } from "../fieldGeometry";
import { useFieldDraw } from "../fieldDrawContext";
import { TextBatch, type GlyphAtlas, type TextLabel } from "../sdfText";

/**
 * Every rectangle of the field in one instanced draw. A rectangle thinner than
 * one device pixel is drawn one pixel wide and fades by how much of the pixel
 * it covers, so lines follow the zoom but never shimmer or vanish when zoomed
 * out (ADR 0005 D-2).
 */
const VERTEX = /* glsl */ `
attribute vec4 aBounds; // minX, minY, maxX, maxY
attribute vec4 aColor;
uniform float uPixel;   // one device pixel in field units
uniform float uMinCoverage;
uniform float uEdge;    // room for antialiased edges, in device pixels
varying vec4 vColor;
varying vec2 vPos;
varying vec4 vBounds;
void main() {
    vec2 size = aBounds.zw - aBounds.xy;
    vec2 drawn = max(size, vec2(uPixel));
    float coverage = min(1.0, size.x / uPixel) * min(1.0, size.y / uPixel);
    if (coverage < uMinCoverage) {
        // Too faint to be worth drawing (low-quality mode): outside the view
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        vColor = vec4(0.0);
        vPos = vec2(0.0);
        vBounds = vec4(0.0);
        return;
    }
    vec2 center = (aBounds.xy + aBounds.zw) * 0.5;
    vBounds = vec4(center - drawn * 0.5, center + drawn * 0.5);
    vPos = center + (position.xy - 0.5) * (drawn + 2.0 * uEdge * uPixel);
    vColor = vec4(aColor.rgb, aColor.a * coverage);
    gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 0.0, 1.0);
}`;

/**
 * Antialiased edges (#249): each pixel is covered by the share of it the
 * rectangle covers, as Canvas2D draws, so a line keeps its width wherever its
 * edges fall between pixels. Without it, edges snapped to whole pixels and
 * lines of one width were drawn 1 or 2 px wide side by side.
 */
const FRAGMENT_EDGES = /* glsl */ `
varying vec4 vColor;
varying vec2 vPos;
varying vec4 vBounds;
void main() {
    vec2 pixel = fwidth(vPos);
    vec2 covered = min(vBounds.zw, vPos + pixel * 0.5)
        - max(vBounds.xy, vPos - pixel * 0.5);
    vec2 share = clamp(covered / pixel, 0.0, 1.0);
    float alpha = vColor.a * share.x * share.y;
    if (alpha <= 0.0) discard;
    gl_FragColor = vec4(vColor.rgb, alpha);
}`;

/** Solid rectangles: the background, whose edges sit under the border. */
const FRAGMENT_SOLID = /* glsl */ `
varying vec4 vColor;
void main() {
    gl_FragColor = vColor;
}`;

/**
 * Rectangles in one instanced draw, with lines kept at least a device pixel
 * wide. Only lines antialias their edges: the background's fill would pay
 * for it over the whole field.
 */
function rectsMesh(
    rects: FieldRects,
    renderOrder: number,
    { edges }: { edges: boolean },
) {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
        "position",
        new BufferAttribute(
            new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
            3,
        ),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute(
        "aBounds",
        new InstancedBufferAttribute(rects.bounds, 4),
    );
    geometry.setAttribute(
        "aColor",
        new InstancedBufferAttribute(rects.colors, 4),
    );
    geometry.instanceCount = rects.count;
    const mesh = new Mesh(
        geometry,
        new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: edges ? FRAGMENT_EDGES : FRAGMENT_SOLID,
            uniforms: {
                uPixel: { value: 1 },
                uMinCoverage: { value: 0 },
                uEdge: { value: edges ? 1 : 0 },
            },
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: DoubleSide,
        }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    return mesh;
}

/**
 * The field: background, grid, half lines, yard lines, hashes, the border,
 * yard numbers and the checkpoint labels around it, as `planField2d` lays
 * them out. The background draws under the field image
 * (`BackgroundImageLayer`, render order -1), everything else over it.
 * Rebuilt only when the field properties or the grid and half line settings
 * change.
 */
export default function FieldLayer({
    fieldProperties,
    numberAtlas,
    labelAtlas,
}: {
    fieldProperties: FieldProperties;
    /** The yard number font. */
    numberAtlas: GlyphAtlas;
    /** The checkpoint label font. */
    labelAtlas: GlyphAtlas;
}) {
    const invalidate = useThree((s) => s.invalidate);
    const draw = useFieldDraw();
    const dpr = useThree((s) => s.viewport.dpr);
    const gridLines = useUiSettingsStore((s) => s.uiSettings.gridLines);
    const halfLines = useUiSettingsStore((s) => s.uiSettings.halfLines);

    const layer = useMemo(() => {
        const { background, rects, texts } = fieldGeometry(fieldProperties, {
            gridLines,
            halfLines,
        });
        const batch = (atlas: GlyphAtlas, font: "number" | "label") => {
            const chosen = texts.filter((text) => text.font === font);
            const text = new TextBatch(atlas);
            text.setLabels(
                chosen.map(
                    (t): TextLabel => ({
                        text: t.text,
                        size: t.size,
                        rotation: t.rotation,
                        align: t.align,
                        baseline: t.baseline,
                        letterSpacing: t.letterSpacing,
                        color: rgba01(t.color),
                    }),
                ),
            );
            text.setAnchors(chosen.flatMap((t) => [t.x, t.y]));
            text.mesh.renderOrder = 1;
            return text;
        };
        return {
            background: rectsMesh(background, -2, { edges: false }),
            lines: rectsMesh(rects, 0, { edges: true }),
            numbers: batch(numberAtlas, "number"),
            labels: batch(labelAtlas, "label"),
        };
    }, [fieldProperties, gridLines, halfLines, numberAtlas, labelAtlas]);

    useEffect(() => {
        invalidate();
        return () => {
            for (const mesh of [layer.background, layer.lines]) {
                mesh.geometry.dispose();
                mesh.material.dispose();
            }
            layer.numbers.dispose();
            layer.labels.dispose();
        };
    }, [layer, invalidate]);

    useFrame(() => {
        const { zoom } = draw.view.getState();
        const pixel = 1 / (zoom * dpr);
        layer.background.material.uniforms.uPixel.value = pixel;
        layer.lines.material.uniforms.uPixel.value = pixel;
        layer.lines.material.uniforms.uMinCoverage.value =
            draw.quality().minLineCoverage;
    });

    return (
        <>
            <primitive object={layer.background} />
            <primitive object={layer.lines} />
            <primitive object={layer.numbers.mesh} />
            <primitive object={layer.labels.mesh} />
        </>
    );
}
