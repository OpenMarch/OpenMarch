/**
 * Small icons drawn beside marcher labels on the 2D field (fork #992: what a performer holds): an
 * atlas of the section icons (upstream OpenMarch #1071) rendered once from their SVG, and a batch
 * that draws many of them in one instanced call, tinted like the labels.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
    BufferAttribute,
    CanvasTexture,
    DoubleSide,
    DynamicDrawUsage,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    LinearFilter,
    LinearMipmapLinearFilter,
    Mesh,
    ShaderMaterial,
} from "three";
import {
    MarchingTubaIcon,
    SabreIcon,
    SECTION_ICONS,
} from "@/components/marcher/sectionIcons/SectionIcon";
import type { EquipmentIconKey } from "@/cues/equipmentIcons";

/** Each icon's cell in the atlas, in pixels: drawn small on the field, so mipmapped down. */
const CELL = 128;
/** Blank pixels kept around each icon, so mipmaps don't bleed neighbors in. */
const PAD = 8;

export interface IconAtlas {
    readonly texture: CanvasTexture;
    /** Each icon's `[u0, v0, u1, v1]` in the texture. */
    readonly uv: ReadonlyMap<EquipmentIconKey, readonly number[]>;
}

const ICONS: ReadonlyMap<EquipmentIconKey, typeof MarchingTubaIcon> = new Map([
    ...(Object.entries(SECTION_ICONS) as [
        EquipmentIconKey,
        typeof MarchingTubaIcon,
    ][]),
    ["MarchingTuba", MarchingTubaIcon],
    ["Sabre", SabreIcon],
]);

let loading: Promise<IconAtlas> | null = null;

/**
 * The icon atlas, drawn once: every icon in white on transparent, bold so its strokes survive
 * being drawn a few pixels tall. Rejects where the page can't draw (tests without a canvas).
 */
export function loadIconAtlas(): Promise<IconAtlas> {
    loading ??= drawAtlas().catch((error: unknown) => {
        loading = null;
        throw error;
    });
    return loading;
}

async function drawAtlas(): Promise<IconAtlas> {
    const keys = [...ICONS.keys()];
    const columns = Math.ceil(Math.sqrt(keys.length));
    const rows = Math.ceil(keys.length / columns);
    const canvas = document.createElement("canvas");
    canvas.width = columns * CELL;
    canvas.height = rows * CELL;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D canvas for the icon atlas");
    const uv = new Map<EquipmentIconKey, readonly number[]>();
    await Promise.all(
        keys.map(async (key, i) => {
            const svg = renderToStaticMarkup(
                createElement(ICONS.get(key)!, {
                    size: CELL - PAD * 2,
                    color: "#ffffff",
                    weight: "bold",
                }),
            );
            const image = await loadSvg(svg);
            const x = (i % columns) * CELL;
            const y = Math.floor(i / columns) * CELL;
            context.drawImage(
                image,
                x + PAD,
                y + PAD,
                CELL - PAD * 2,
                CELL - PAD * 2,
            );
            // Canvas rows run down, texture v up (flipY)
            uv.set(key, [
                x / canvas.width,
                1 - (y + CELL) / canvas.height,
                (x + CELL) / canvas.width,
                1 - y / canvas.height,
            ]);
        }),
    );
    const texture = new CanvasTexture(canvas);
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    texture.anisotropy = 4;
    return { texture, uv };
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("An icon didn't load"));
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
}

const VERTEX = /* glsl */ `
attribute vec2 aAnchor;
attribute vec4 aRect;  // left, top, width, height in field units from the anchor, y down
attribute vec4 aUv;    // u0, v0, u1, v1
attribute vec4 aColor;
attribute float aScaled; // 1 for an icon in place of a dot: it grows as dots do when zoomed out
uniform vec2 uOffset;
uniform float uDotScale;
varying vec2 vUv;
varying vec4 vColor;
void main() {
    vec2 local = (aRect.xy + position.xy * aRect.zw) * mix(1.0, uDotScale, aScaled);
    // y runs down on the field and up in the texture
    vUv = vec2(mix(aUv.x, aUv.z, position.x), mix(aUv.w, aUv.y, position.y));
    vColor = aColor;
    gl_Position = projectionMatrix * viewMatrix * vec4(aAnchor + uOffset + local, 0.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uOpacity;
varying vec2 vUv;
varying vec4 vColor;
void main() {
    float a = texture2D(uAtlas, vUv).a * vColor.a * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
}`;

/** One icon: which, where from its marcher's anchor, and its color. */
export interface FieldIcon {
    readonly icon: EquipmentIconKey;
    /** The marcher it belongs to, by index in the anchors given to {@link IconBatch.setAnchors} */
    readonly owner: number;
    /** Its middle, from the anchor, in field units (y down) */
    readonly x: number;
    readonly y: number;
    /** Its width and height, in field units */
    readonly size: number;
    /** `[r, g, b, a]`, 0 to 1 */
    readonly color: readonly [number, number, number, number];
    /** In place of a dot: scaled with the dots ({@link IconBatch.dotScale}) */
    readonly scaled?: boolean;
}

/**
 * Many icons in one draw call, each an instance anchored at its marcher, so moving marchers
 * rewrites one vec2 per icon ({@link setAnchors}) and allocates nothing.
 */
export class IconBatch {
    readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
    private anchors = new Float32Array(0);
    private anchorAttr: InstancedBufferAttribute | null = null;
    private owner = new Int32Array(0);

    constructor(private readonly atlas: IconAtlas) {
        const geometry = new InstancedBufferGeometry();
        geometry.setAttribute(
            "position",
            new BufferAttribute(
                new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
                3,
            ),
        );
        geometry.setIndex([0, 1, 2, 0, 2, 3]);
        geometry.instanceCount = 0;
        this.mesh = new Mesh(
            geometry,
            new ShaderMaterial({
                vertexShader: VERTEX,
                fragmentShader: FRAGMENT,
                uniforms: {
                    uAtlas: { value: atlas.texture },
                    uOpacity: { value: 1 },
                    uOffset: { value: [0, 0] },
                    uDotScale: { value: 1 },
                },
                transparent: true,
                depthTest: false,
                depthWrite: false,
                side: DoubleSide,
            }),
        );
        this.mesh.frustumCulled = false;
    }

    /** Lays out `icons`. Their anchors are all (0, 0) until {@link setAnchors}. */
    setIcons(icons: readonly FieldIcon[]) {
        this.mesh.geometry.dispose();
        const count = icons.length;
        const rect = new Float32Array(count * 4);
        const uv = new Float32Array(count * 4);
        const color = new Float32Array(count * 4);
        const scaled = new Float32Array(count);
        this.owner = new Int32Array(count);
        this.anchors = new Float32Array(count * 2);
        icons.forEach((icon, i) => {
            rect.set(
                [
                    icon.x - icon.size / 2,
                    icon.y - icon.size / 2,
                    icon.size,
                    icon.size,
                ],
                i * 4,
            );
            uv.set(
                this.atlas.uv.get(icon.icon) ??
                    this.atlas.uv.get("Other") ?? [0, 0, 0, 0],
                i * 4,
            );
            color.set(icon.color, i * 4);
            scaled[i] = icon.scaled ? 1 : 0;
            this.owner[i] = icon.owner;
        });
        const geometry = this.mesh.geometry;
        geometry.setAttribute("aRect", new InstancedBufferAttribute(rect, 4));
        geometry.setAttribute("aUv", new InstancedBufferAttribute(uv, 4));
        geometry.setAttribute("aColor", new InstancedBufferAttribute(color, 4));
        geometry.setAttribute(
            "aScaled",
            new InstancedBufferAttribute(scaled, 1),
        );
        this.anchorAttr = new InstancedBufferAttribute(this.anchors, 2);
        this.anchorAttr.setUsage(DynamicDrawUsage);
        geometry.setAttribute("aAnchor", this.anchorAttr);
        geometry.instanceCount = count;
    }

    /** Moves every icon: `xy` holds one anchor per marcher (x0, y0, x1, y1, …). */
    setAnchors(xy: ArrayLike<number>) {
        const owner = this.owner;
        const out = this.anchors;
        for (let i = 0; i < owner.length; i++) {
            const at = owner[i] * 2;
            if (at + 1 >= xy.length) continue;
            out[i * 2] = xy[at];
            out[i * 2 + 1] = xy[at + 1];
        }
        if (this.anchorAttr) this.anchorAttr.needsUpdate = true;
    }

    /** Moves every icon by the same amount, in field units. */
    setOffset(x: number, y: number) {
        this.mesh.material.uniforms.uOffset.value = [x, y];
    }

    /** How much larger than its field size a dot is drawn (`dotSizes`): icons in its place follow */
    set dotScale(value: number) {
        this.mesh.material.uniforms.uDotScale.value = value;
    }

    set opacity(value: number) {
        this.mesh.material.uniforms.uOpacity.value = value;
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
