import { pixelsToWorld } from "@openmarch/core";
import type { ImageSize, PlanContext, PlanImage } from "./plan";

/**
 * Places the field background image like
 * `OpenMarchCanvas.refreshBackgroundImageValues`: "fit" shows the whole
 * image inside the field's canvas rectangle, "fill" covers the rectangle and
 * crops the overflow (the painter clips to the surface). Anything other than
 * "fill" is treated as "fit", as in 2D.
 */
export function planImage(
    ctx: PlanContext,
    image: ImageSize,
    opacity: number,
): PlanImage {
    const fp = ctx.fieldProperties;
    const { width, height } = fp;
    const imgAspect = image.width / image.height;
    const canvasAspect = width / height;
    const fill = fp.imageFillOrFit === "fill";
    // "fill" scales to the axis that overflows; "fit" to the one that fits.
    const byHeight = fill
        ? imgAspect > canvasAspect
        : imgAspect <= canvasAspect;
    const scale = byHeight ? height / image.height : width / image.width;
    const left = byHeight ? (width - image.width * scale) / 2 : 0;
    const top = byHeight ? 0 : (height - image.height * scale) / 2;
    const a = pixelsToWorld(fp, { x: left, y: top });
    const b = pixelsToWorld(fp, {
        x: left + image.width * scale,
        y: top + image.height * scale,
    });
    return {
        type: "image",
        role: "image",
        minX: a.x,
        maxX: b.x,
        minZ: a.z,
        maxZ: b.z,
        opacity,
    };
}
