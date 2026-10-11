import type { FieldProperties, FieldTheme } from "@openmarch/core";
import {
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    type CanvasTexture,
} from "three";
import { paintCanvasTexture } from "../environment";
import type { VenueParams } from "../types";
import {
    paintPlan,
    textureLayout,
    textureLongSide,
    type TextureLayout,
} from "./paint";
import {
    createPlanContext,
    type EndZoneStyle,
    type FieldPlan,
    type FieldSurfaceStyle,
    type ImageSize,
} from "./plan";
import { planTarp } from "./tarpPlan";
import { planTheme } from "./themePlan";
import { planTurf } from "./turfPlan";

/**
 * Field surface (P2.1, design.md section 4). Framework-free: three.js only
 * (ADR 0002 D-1), in meters with the field at z <= 0 (D-2).
 *
 * `buildFieldSurface` plans the field from `FieldProperties` with the same
 * semantics as `OpenMarchCanvas.createFieldGrid`, paints the plan into one
 * canvas texture and returns a plane covering `fieldFootprint` at
 * y = `FIELD_SURFACE_Y`. Styles: `turf` (stadium kits), `theme` (blank) and
 * `tarp` (gym). Tests call `setTexturePainting(false)` from the environment
 * module, and can paint a plan into any 2D context with `paintPlan`.
 */
export type {
    EndZoneStyle,
    FieldPlan,
    FieldSurfaceStyle,
    PlanItem,
    FieldRole,
} from "./plan";
export { END_ZONE_STYLES } from "./plan";
export { paintPlan, textureLayout, textureLongSide } from "./paint";
export type { TextureLayout } from "./paint";

/** Height of the surface above the kits' ground and floors. */
export const FIELD_SURFACE_Y = 0.02;

/** An image the 2D canvas would show as the field background. */
export type FieldImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface FieldSurfaceInput {
    fieldProperties: FieldProperties;
    /** Defaults to `fieldProperties.theme`. Only the `theme` style uses it fully. */
    theme?: FieldTheme;
    style: FieldSurfaceStyle;
    params: VenueParams;
    /** Turf end-zone paint; defaults to `solid`. */
    endZoneStyle?: EndZoneStyle;
    /** The show's field background image, if it has one. */
    image?: FieldImage | null;
    /** `renderer.capabilities.maxTextureSize`; 8192 px textures need >= 8192. */
    maxTextureSize?: number;
    /** `renderer.capabilities.getMaxAnisotropy()`; defaults to 16. */
    anisotropy?: number;
}

export interface FieldSurface {
    mesh: Mesh<PlaneGeometry, MeshStandardMaterial>;
    plan: FieldPlan;
    /** Resolves after the surface is repainted with the loaded web font. */
    ready: Promise<void>;
    dispose(): void;
}

const ROUGHNESS: Record<FieldSurfaceStyle, number> = {
    turf: 0.95,
    theme: 0.9,
    tarp: 0.7,
};

export function imageSize(image: FieldImage): ImageSize {
    const natural =
        "naturalWidth" in image && image.naturalWidth > 0
            ? { width: image.naturalWidth, height: image.naturalHeight }
            : { width: image.width, height: image.height };
    return natural;
}

/** Plans a field surface without painting it. */
export function planField(input: FieldSurfaceInput): FieldPlan {
    const image =
        input.image && imageSize(input.image).width > 0
            ? imageSize(input.image)
            : null;
    const ctx = createPlanContext({
        fieldProperties: input.fieldProperties,
        theme: input.theme ?? input.fieldProperties.theme,
        style: input.style,
        params: input.params,
        endZoneStyle: input.endZoneStyle,
        image,
    });
    if (input.style === "turf") planTurf(ctx);
    else if (input.style === "tarp") planTarp(ctx);
    else planTheme(ctx);
    return { style: input.style, footprint: ctx.footprint, items: ctx.items };
}

export function buildFieldSurface(input: FieldSurfaceInput): FieldSurface {
    const plan = planField(input);
    const f = plan.footprint;
    const layout = textureLayout(f, textureLongSide(input.maxTextureSize));
    let painted = false;
    const paint = (g: CanvasRenderingContext2D) => {
        painted = true;
        g.clearRect(0, 0, layout.width, layout.height);
        paintPlan(g, plan, layout, input.image);
    };
    const texture = paintCanvasTexture(layout.width, layout.height, paint, {
        anisotropy: input.anisotropy ?? 16,
    });
    const material = new MeshStandardMaterial({
        color: 0xffffff,
        map: texture,
        roughness: ROUGHNESS[input.style],
    });
    const geometry = new PlaneGeometry(f.maxX - f.minX, f.maxZ - f.minZ);
    const mesh = new Mesh(geometry, material);
    mesh.name = "fieldSurface";
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(
        (f.minX + f.maxX) / 2,
        FIELD_SURFACE_Y,
        (f.minZ + f.maxZ) / 2,
    );
    mesh.receiveShadow = true;
    mesh.userData.fieldStyle = input.style;

    let disposed = false;
    const hasText = plan.items.some((i) => i.type === "text");
    const ready = hasText
        ? fontsLoaded().then(() => {
              if (!disposed && painted) repaint(texture, layout, paint);
          })
        : Promise.resolve();

    return {
        mesh,
        plan,
        ready,
        dispose() {
            disposed = true;
            texture.dispose();
            material.dispose();
            geometry.dispose();
        },
    };
}

function repaint(
    texture: CanvasTexture,
    layout: TextureLayout,
    paint: (g: CanvasRenderingContext2D) => void,
): void {
    const canvas = texture.image as HTMLCanvasElement;
    const g = canvas.getContext("2d");
    if (!g || canvas.width !== layout.width) return;
    paint(g);
    texture.needsUpdate = true;
}

/** Waits for DM Sans (design.md section 4); never rejects. */
function fontsLoaded(): Promise<void> {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts || typeof fonts.load !== "function") return Promise.resolve();
    return Promise.all([
        fonts.load('700 64px "DM Sans"'),
        fonts.load('600 64px "DM Sans"'),
    ]).then(
        () => undefined,
        () => undefined,
    );
}
