import {
    BufferAttribute,
    DataTexture,
    DoubleSide,
    DynamicDrawUsage,
    InstancedBufferAttribute,
    InstancedBufferGeometry,
    LinearFilter,
    LinearMipmapLinearFilter,
    Mesh,
    RedFormat,
    ShaderMaterial,
    UnsignedByteType,
} from "three";

/**
 * Text as signed-distance-field (SDF) glyphs (ADR 0005 D-2): one glyph atlas
 * per font, built in the browser, and one instanced draw for every label in a
 * {@link TextBatch}. SDF glyphs stay sharp at any zoom.
 *
 * The distance field is computed with the Felzenszwalb distance transform
 * (the TinySDF approach), so there is no font build step. Units are field
 * units with y growing downward, as everywhere on the new field.
 */

const FONT_PX = 48;
const BUFFER = 8;
const RADIUS = 12;
const CUTOFF = 0.25;
const CELL = FONT_PX + BUFFER * 2;
const COLS = 16;
/** Distance-field margin kept around the ink, in atlas pixels. */
const INK_MARGIN = 5;

type Glyph = {
    /** Cell origin in the atlas, pixels. */
    x: number;
    y: number;
    /** Advance in em. */
    advance: number;
    /** The ink box plus the margin, in cell pixels (y down). Empty for a space. */
    rx: number;
    ry: number;
    rw: number;
    rh: number;
};

/** The printable ASCII glyphs of one font, as a distance field. */
export class GlyphAtlas {
    readonly texture: DataTexture;
    private readonly glyphs = new Map<string, Glyph>();
    private readonly width: number;
    private readonly height: number;
    /** Baseline from the top of a cell, pixels. */
    private readonly baseline = BUFFER + Math.round(FONT_PX * 0.8);

    /** @param family - a CSS font, without its size (`bold "Courier New", monospace`) */
    constructor(family: string) {
        const chars: string[] = [];
        for (let c = 32; c < 127; c++) chars.push(String.fromCharCode(c));
        const rows = Math.ceil(chars.length / COLS);
        this.width = COLS * CELL;
        this.height = 1 << Math.ceil(Math.log2(rows * CELL));
        const data = new Uint8Array(this.width * this.height);

        const canvas = document.createElement("canvas");
        canvas.width = CELL;
        canvas.height = CELL;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.font = fontWithSize(family, FONT_PX);
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = "black";

        const outer = new Float64Array(CELL * CELL);
        const inner = new Float64Array(CELL * CELL);
        const f = new Float64Array(CELL);
        const z = new Float64Array(CELL + 1);
        const v = new Uint16Array(CELL);

        chars.forEach((ch, i) => {
            const cx = (i % COLS) * CELL;
            const cy = Math.floor(i / COLS) * CELL;
            ctx.clearRect(0, 0, CELL, CELL);
            ctx.fillText(ch, BUFFER, this.baseline);
            const advance = ctx.measureText(ch).width / FONT_PX;
            const img = ctx.getImageData(0, 0, CELL, CELL).data;
            const [ix0, iy0, ix1, iy1] = seedDistances(img, outer, inner);
            edt(outer, CELL, CELL, f, v, z);
            edt(inner, CELL, CELL, f, v, z);
            for (let y = 0; y < CELL; y++) {
                for (let x = 0; x < CELL; x++) {
                    const p = y * CELL + x;
                    const d = Math.sqrt(outer[p]) - Math.sqrt(inner[p]);
                    const value = Math.round(255 - 255 * (d / RADIUS + CUTOFF));
                    data[(cy + y) * this.width + cx + x] = Math.max(
                        0,
                        Math.min(255, value),
                    );
                }
            }
            const rx = Math.max(0, ix0 - INK_MARGIN);
            const ry = Math.max(0, iy0 - INK_MARGIN);
            const rw = ix1 < 0 ? 0 : Math.min(CELL, ix1 + 1 + INK_MARGIN) - rx;
            const rh = iy1 < 0 ? 0 : Math.min(CELL, iy1 + 1 + INK_MARGIN) - ry;
            this.glyphs.set(ch, { x: cx, y: cy, advance, rx, ry, rw, rh });
        });

        this.texture = new DataTexture(
            data,
            this.width,
            this.height,
            RedFormat,
            UnsignedByteType,
        );
        this.texture.magFilter = LinearFilter;
        this.texture.minFilter = LinearMipmapLinearFilter;
        this.texture.generateMipmaps = true;
        this.texture.needsUpdate = true;
    }

    /** A glyph's quad and texture coordinates, or `?`'s for a character outside the atlas. */
    glyph(ch: string): Glyph {
        return this.glyphs.get(ch) ?? this.glyphs.get("?")!;
    }

    /** A string's advance in em. */
    measure(text: string): number {
        let width = 0;
        for (const ch of text) width += this.glyph(ch).advance;
        return width;
    }

    /**
     * Writes one glyph's quad (left, top, width, height in em, relative to the
     * pen on the baseline, y down) and texture rectangle (u0, v0, u1, v1).
     */
    writeGlyph(
        glyph: Glyph,
        pen: number,
        baseline: number,
        quad: Float32Array,
        uv: Float32Array,
        at: number,
    ) {
        quad[at] = pen + (glyph.rx - BUFFER) / FONT_PX;
        quad[at + 1] = baseline + (glyph.ry - this.baseline) / FONT_PX;
        quad[at + 2] = glyph.rw / FONT_PX;
        quad[at + 3] = glyph.rh / FONT_PX;
        uv[at] = (glyph.x + glyph.rx) / this.width;
        uv[at + 1] = (glyph.y + glyph.ry) / this.height;
        uv[at + 2] = (glyph.x + glyph.rx + glyph.rw) / this.width;
        uv[at + 3] = (glyph.y + glyph.ry + glyph.rh) / this.height;
    }

    dispose() {
        this.texture.dispose();
    }
}

const fontWithSize = (family: string, px: number) => {
    // `bold "Courier New", monospace` → `bold 48px "Courier New", monospace`
    const match =
        /^((?:(?:normal|italic|bold|bolder|lighter|\d{3})\s+)*)(.*)$/.exec(
            family,
        );
    return `${match?.[1] ?? ""}${px}px ${match?.[2] ?? family}`;
};

/**
 * Seeds the outer and inner squared distances from a cell's alpha, and returns
 * its ink box (x0, y0, x1, y1; x1 is -1 for a blank glyph).
 */
function seedDistances(
    img: Uint8ClampedArray,
    outer: Float64Array,
    inner: Float64Array,
): [number, number, number, number] {
    let ix0 = CELL;
    let iy0 = CELL;
    let ix1 = -1;
    let iy1 = -1;
    for (let p = 0; p < CELL * CELL; p++) {
        const a = img[p * 4 + 3] / 255;
        if (a > 0) {
            const px = p % CELL;
            const py = (p / CELL) | 0;
            if (px < ix0) ix0 = px;
            if (px > ix1) ix1 = px;
            if (py < iy0) iy0 = py;
            if (py > iy1) iy1 = py;
        }
        if (a === 1) {
            outer[p] = 0;
            inner[p] = 1e20;
        } else if (a === 0) {
            outer[p] = 1e20;
            inner[p] = 0;
        } else {
            const d = 0.5 - a;
            outer[p] = d > 0 ? d * d : 0;
            inner[p] = d < 0 ? d * d : 0;
        }
    }
    return [ix0, iy0, ix1, iy1];
}

/** 2D Euclidean distance transform (Felzenszwalb & Huttenlocher), in place. */
function edt(
    data: Float64Array,
    width: number,
    height: number,
    f: Float64Array,
    v: Uint16Array,
    z: Float64Array,
) {
    for (let x = 0; x < width; x++) edt1d(data, x, width, height, f, v, z);
    for (let y = 0; y < height; y++) edt1d(data, y * width, 1, width, f, v, z);
}

function edt1d(
    grid: Float64Array,
    offset: number,
    stride: number,
    length: number,
    f: Float64Array,
    v: Uint16Array,
    z: Float64Array,
) {
    v[0] = 0;
    z[0] = -1e20;
    z[1] = 1e20;
    f[0] = grid[offset];
    for (let q = 1, k = 0, s = 0; q < length; q++) {
        f[q] = grid[offset + q * stride];
        const q2 = q * q;
        do {
            const r = v[k];
            s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
        } while (s <= z[k] && --k > -1);
        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = 1e20;
    }
    for (let q = 0, k = 0; q < length; q++) {
        while (z[k + 1] < q) k++;
        const r = v[k];
        const qr = q - r;
        grid[offset + q * stride] = f[r] + qr * qr;
    }
}

const VERTEX = /* glsl */ `
attribute vec2 aAnchor;
attribute vec4 aGlyph;    // left, top, width, height in em from the label's anchor, y down
attribute vec4 aUv;       // u0, v0, u1, v1
attribute vec2 aScaleRot; // field units per em, rotation in radians
attribute vec4 aColor;
uniform vec2 uOffset;
varying vec2 vUv;
varying vec4 vColor;
void main() {
    vec2 local = (aGlyph.xy + position.xy * aGlyph.zw) * aScaleRot.x;
    float c = cos(aScaleRot.y), s = sin(aScaleRot.y);
    local = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
    vUv = mix(aUv.xy, aUv.zw, position.xy);
    vColor = aColor;
    gl_Position = projectionMatrix * viewMatrix * vec4(aAnchor + uOffset + local, 0.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uOpacity;
varying vec2 vUv;
varying vec4 vColor;
void main() {
    float d = texture2D(uAtlas, vUv).r;
    float w = max(fwidth(d) * 0.7, 0.002);
    float edge = ${(1 - CUTOFF).toFixed(3)};
    float a = smoothstep(edge - w, edge + w, d) * vColor.a * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, a);
}`;

export type TextLabel = {
    text: string;
    /** Field units per em (a CSS font size). */
    size: number;
    /** Radians, about the anchor. */
    rotation?: number;
    /** Which edge of the text the anchor is on, horizontally. Default center. */
    align?: "left" | "center" | "right";
    /** The baseline's offset below the anchor, in em. */
    baseline?: number;
    /** Extra space between characters, in em (not after the last). */
    letterSpacing?: number;
    /** `[r, g, b, a]`, 0 to 1. */
    color: readonly [number, number, number, number];
};

/**
 * Many labels in one draw call. Each glyph is one instance, anchored at its
 * label's anchor, so moving labels rewrites one vec2 per glyph
 * ({@link setAnchors}) and allocates nothing.
 */
export class TextBatch {
    readonly mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>;
    private anchors = new Float32Array(0);
    private anchorAttr: InstancedBufferAttribute | null = null;
    /** The label of each glyph. */
    private owner = new Int32Array(0);

    constructor(private readonly atlas: GlyphAtlas) {
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
        const material = new ShaderMaterial({
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            uniforms: {
                uAtlas: { value: atlas.texture },
                uOpacity: { value: 1 },
                uOffset: { value: [0, 0] },
            },
            transparent: true,
            depthTest: false,
            depthWrite: false,
            side: DoubleSide,
        });
        this.mesh = new Mesh(geometry, material);
        this.mesh.frustumCulled = false;
    }

    /** Lays out `labels`. Their anchors are all (0, 0) until {@link setAnchors}. */
    setLabels(labels: readonly TextLabel[]) {
        // Frees the old buffers; three uploads the new ones on the next draw
        this.mesh.geometry.dispose();
        let count = 0;
        // Code points, as the layout loop below walks them
        for (const label of labels) count += [...label.text].length;
        const quad = new Float32Array(count * 4);
        const uv = new Float32Array(count * 4);
        const scaleRot = new Float32Array(count * 2);
        const color = new Float32Array(count * 4);
        this.owner = new Int32Array(count);
        this.anchors = new Float32Array(count * 2);
        let g = 0;
        labels.forEach((label, li) => {
            const spacing = label.letterSpacing ?? 0;
            const width =
                this.atlas.measure(label.text) +
                spacing * Math.max(0, [...label.text].length - 1);
            let pen =
                label.align === "left"
                    ? 0
                    : label.align === "right"
                      ? -width
                      : -width / 2;
            for (const ch of label.text) {
                const glyph = this.atlas.glyph(ch);
                this.atlas.writeGlyph(
                    glyph,
                    pen,
                    label.baseline ?? 0,
                    quad,
                    uv,
                    g * 4,
                );
                scaleRot[g * 2] = label.size;
                scaleRot[g * 2 + 1] = label.rotation ?? 0;
                color.set(label.color, g * 4);
                this.owner[g] = li;
                pen += glyph.advance + spacing;
                g++;
            }
        });
        const geometry = this.mesh.geometry;
        geometry.setAttribute("aGlyph", new InstancedBufferAttribute(quad, 4));
        geometry.setAttribute("aUv", new InstancedBufferAttribute(uv, 4));
        geometry.setAttribute(
            "aScaleRot",
            new InstancedBufferAttribute(scaleRot, 2),
        );
        geometry.setAttribute("aColor", new InstancedBufferAttribute(color, 4));
        this.anchorAttr = new InstancedBufferAttribute(this.anchors, 2);
        this.anchorAttr.setUsage(DynamicDrawUsage);
        geometry.setAttribute("aAnchor", this.anchorAttr);
        geometry.instanceCount = count;
    }

    /**
     * Moves every label: `xy` holds one anchor per label (x0, y0, x1, y1, …).
     * Labels past the end of `xy` keep their anchors. Allocates nothing.
     */
    setAnchors(xy: ArrayLike<number>) {
        const owner = this.owner;
        const out = this.anchors;
        for (let g = 0; g < owner.length; g++) {
            const li = owner[g] * 2;
            if (li + 1 >= xy.length) continue;
            out[g * 2] = xy[li];
            out[g * 2 + 1] = xy[li + 1];
        }
        if (this.anchorAttr) this.anchorAttr.needsUpdate = true;
    }

    /** Moves every label by the same amount, in field units. */
    setOffset(x: number, y: number) {
        this.mesh.material.uniforms.uOffset.value = [x, y];
    }

    set opacity(value: number) {
        this.mesh.material.uniforms.uOpacity.value = value;
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
