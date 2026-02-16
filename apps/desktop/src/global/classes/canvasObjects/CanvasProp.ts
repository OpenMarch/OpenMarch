import { fabric } from "fabric";
import { rgbaToString } from "@openmarch/core";
import * as Selectable from "./interfaces/Selectable";
import { DatabaseProp, DatabasePropPageGeometry } from "../Prop";
import { dbMarcherToMarcher } from "../Marcher";
import { schema } from "@/global/database/db";
import CanvasMarcher from "./CanvasMarcher";

type DatabaseMarcher = typeof schema.marchers.$inferSelect;
type Point = { x: number; y: number };

const DEFAULT_FILL_COLOR = { r: 64, g: 64, b: 64, a: 0.25 };
const DEFAULT_OUTLINE_COLOR = { r: 0, g: 0, b: 0, a: 1 };
const CENTER_X_COLOR = "rgba(128, 128, 128, 0.6)";
const CENTER_X_SIZE = 6;

/** Creates an offscreen canvas with the image drawn at the given opacity, scaled to fit */
function createImagePattern(
    img: HTMLImageElement,
    width: number,
    height: number,
    opacity: number,
): fabric.Pattern {
    const offscreen = document.createElement("canvas");
    offscreen.width = Math.max(1, Math.round(width));
    offscreen.height = Math.max(1, Math.round(height));
    const ctx = offscreen.getContext("2d")!;
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    ctx.drawImage(img, 0, 0, offscreen.width, offscreen.height);
    return new fabric.Pattern({
        source: offscreen as unknown as HTMLImageElement,
        repeat: "no-repeat",
    });
}

interface CustomGeometryData {
    points?: Point[];
    originalWidth?: number;
    originalHeight?: number;
    /** Whether a freehand path should be closed. Defaults to true. */
    closed?: boolean;
}

/** Scales points from original dimensions to target dimensions, centered at origin */
function scalePointsToCenter(
    points: Point[],
    origWidth: number,
    origHeight: number,
    targetWidth: number,
    targetHeight: number,
): Point[] {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const origCenterX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const origCenterY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const scaleX = targetWidth / (origWidth || 1);
    const scaleY = targetHeight / (origHeight || 1);

    return points.map((p) => ({
        x: (p.x - origCenterX) * scaleX,
        y: (p.y - origCenterY) * scaleY,
    }));
}

/**
 * CanvasProp extends CanvasMarcher to represent props on the canvas.
 * Props are field objects like platforms, tarps, and structures that can move like marchers.
 */
export default class CanvasProp extends CanvasMarcher {
    // Override classString for selection handling
    readonly classString = Selectable.SelectableClasses.PROP;

    // Prop-specific properties
    propId: number;
    propObj: DatabaseProp;
    geometry: DatabasePropPageGeometry;
    shapeObject: fabric.Object;

    /** The name label shown above the prop (when enabled) */
    propNameLabel: fabric.Text;

    constructor({
        marcher,
        prop,
        geometry,
        coordinate,
        pixelsPerFoot,
        pageId,
        showName = false,
        imageElement,
        imageOpacity = 1,
    }: {
        marcher: DatabaseMarcher;
        prop: DatabaseProp;
        geometry: DatabasePropPageGeometry;
        coordinate: Point;
        pixelsPerFoot: number;
        /** Page ID for the coordinate. Props should supply the current canvas page. */
        pageId?: number;
        showName?: boolean;
        imageElement?: HTMLImageElement;
        imageOpacity?: number;
    }) {
        const fullMarcher = dbMarcherToMarcher(marcher);
        const widthPixels = geometry.width * pixelsPerFoot;
        const heightPixels = geometry.height * pixelsPerFoot;

        const outlineColor = rgbaToString(DEFAULT_OUTLINE_COLOR);
        const fillColor = imageElement
            ? createImagePattern(
                  imageElement,
                  widthPixels,
                  heightPixels,
                  imageOpacity,
              )
            : rgbaToString(DEFAULT_FILL_COLOR);

        // Create the prop shape
        const shapeObject = CanvasProp.createPropShape({
            shapeType: geometry.shape_type,
            customGeometry: geometry.custom_geometry,
            widthPixels,
            heightPixels,
            fillColor,
            outlineColor,
        });

        // Call parent constructor with customShape
        super({
            marcher: fullMarcher,
            coordinate: {
                x: coordinate.x,
                y: coordinate.y,
                page_id: pageId ?? 0,
            },
            customShape: shapeObject,
            skipTextLabel: true,
            hasControls: true,
        });

        // Store prop-specific properties
        this.propId = prop.id;
        this.propObj = prop;
        this.geometry = geometry;
        this.shapeObject = shapeObject;

        // Add center X marker for simple shapes (rectangle, circle)
        // Use `add` instead of `addWithUpdate` because the group has already
        // been positioned at its coordinate by the parent constructor.
        // `addWithUpdate` would restore children to absolute coords, reset the
        // group to (0,0), then recalculate bounds — producing a bounding box
        // that spans from (0,0) to the coordinate position.
        const isSimpleShape =
            geometry.shape_type === "rectangle" ||
            geometry.shape_type === "circle";
        if (isSimpleShape) {
            const line1 = new fabric.Line(
                [-CENTER_X_SIZE, -CENTER_X_SIZE, CENTER_X_SIZE, CENTER_X_SIZE],
                { stroke: CENTER_X_COLOR, strokeWidth: 1.5 },
            );
            const line2 = new fabric.Line(
                [-CENTER_X_SIZE, CENTER_X_SIZE, CENTER_X_SIZE, -CENTER_X_SIZE],
                { stroke: CENTER_X_COLOR, strokeWidth: 1.5 },
            );
            this.add(
                new fabric.Group([line1, line2], {
                    originX: "center",
                    originY: "center",
                    left: 0,
                    top: 0,
                    selectable: false,
                    evented: false,
                }),
            );
        }

        // Create prop name label (shown above the shape when enabled)
        const nameText =
            fullMarcher.name ||
            fullMarcher.drill_prefix + fullMarcher.drill_order;
        this.propNameLabel = new fabric.Text(nameText, {
            originX: "center",
            originY: "center",
            fontFamily: "courier new",
            fill: "rgba(80, 80, 80, 0.9)",
            fontWeight: "bold",
            fontSize: 12,
            selectable: false,
            hasControls: false,
            hasBorders: false,
            visible: showName,
        });

        // Tighten selection box to shape edges
        this.padding = 0;

        // Configure resize controls for props
        this.setControlsVisibility({
            mt: true,
            mb: true,
            ml: true,
            mr: true,
            tl: true,
            tr: true,
            bl: true,
            br: true,
            mtr: true,
        });

        // Apply saved rotation
        if (geometry.rotation) {
            this.angle = geometry.rotation;
        }
    }

    /** Creates the appropriate fabric shape based on shape_type */
    private static createPropShape({
        shapeType,
        customGeometry,
        widthPixels,
        heightPixels,
        fillColor,
        outlineColor,
    }: {
        shapeType: string;
        customGeometry: string | null;
        widthPixels: number;
        heightPixels: number;
        fillColor: string | fabric.Pattern;
        outlineColor: string;
    }): fabric.Object {
        const baseProps: fabric.IGroupOptions = {
            left: 0,
            top: 0,
            fill: fillColor as string, // fabric accepts Pattern here at runtime
            stroke: outlineColor,
            strokeWidth: 2,
            strokeUniform: true,
            originX: "center" as const,
            originY: "center" as const,
        };

        // Parse custom geometry if available
        let customData: CustomGeometryData | null = null;
        if (customGeometry) {
            try {
                customData = JSON.parse(customGeometry) as CustomGeometryData;
            } catch {
                // Invalid JSON, fall back to rectangle
            }
        }

        switch (shapeType) {
            case "circle":
                return new fabric.Ellipse({
                    rx: widthPixels / 2,
                    ry: heightPixels / 2,
                    ...baseProps,
                });

            case "polygon":
                if (customData?.points && customData.points.length >= 3) {
                    const scaledPoints = scalePointsToCenter(
                        customData.points,
                        customData.originalWidth || 1,
                        customData.originalHeight || 1,
                        widthPixels,
                        heightPixels,
                    );
                    return new fabric.Polygon(scaledPoints, baseProps);
                }
                break;

            case "arc":
                if (customData?.points && customData.points.length === 3) {
                    const [sp1, sp2, sp3] = scalePointsToCenter(
                        customData.points,
                        customData.originalWidth || 1,
                        customData.originalHeight || 1,
                        widthPixels,
                        heightPixels,
                    );
                    const pathData = `M ${sp1.x} ${sp1.y} Q ${sp2.x} ${sp2.y} ${sp3.x} ${sp3.y}`;
                    return new fabric.Path(pathData, baseProps);
                }
                break;

            case "freehand":
                if (customData?.points && customData.points.length >= 2) {
                    const scaledPoints = scalePointsToCenter(
                        customData.points,
                        customData.originalWidth || 1,
                        customData.originalHeight || 1,
                        widthPixels,
                        heightPixels,
                    );
                    const openPath =
                        `M ${scaledPoints[0].x} ${scaledPoints[0].y}` +
                        scaledPoints
                            .slice(1)
                            .map((p) => ` L ${p.x} ${p.y}`)
                            .join("");
                    const pathData =
                        customData.closed !== false
                            ? openPath + " Z"
                            : openPath;
                    return new fabric.Path(pathData, baseProps);
                }
                break;
        }

        // Default: rectangle
        return new fabric.Rect({
            width: widthPixels,
            height: heightPixels,
            ...baseProps,
        });
    }

    /** Update the name label text and visibility (e.g. after prop/marcher name change). */
    updateNameLabel(text: string, visible: boolean): void {
        this.propNameLabel.set({ text, visible });
        this.setCoords();
    }

    /** Keep the name label positioned above the prop */
    setCoords() {
        super.setCoords();
        if (this.propNameLabel?.visible) {
            const abs = this.getAbsoluteCoords();
            const h = (this.getScaledHeight() || 0) / 2;
            this.propNameLabel.set({ left: abs.x, top: abs.y - h - 10 });
            this.propNameLabel.setCoords();
        }
        return this;
    }

    static isCanvasProp(object: fabric.Object): object is CanvasProp {
        return object instanceof CanvasProp;
    }

    static getCanvasPropForProp(
        canvas: fabric.Canvas,
        prop: Pick<DatabaseProp, "id">,
    ): CanvasProp | undefined {
        return canvas
            .getObjects()
            .find(
                (obj): obj is CanvasProp =>
                    CanvasProp.isCanvasProp(obj) && obj.propId === prop.id,
            );
    }

    /** Get current dimensions in feet (rotation-independent) */
    getDimensions(pixelsPerFoot: number): { width: number; height: number } {
        const sx = this.scaleX || 1;
        const sy = this.scaleY || 1;
        // Use raw width/height (excludes stroke) to prevent dimension creep —
        // getScaledWidth() includes strokeWidth, so saving & re-rendering would
        // grow the shape by strokeWidth each cycle.
        const w =
            (this.shapeObject.width || 0) * (this.shapeObject.scaleX || 1);
        const h =
            (this.shapeObject.height || 0) * (this.shapeObject.scaleY || 1);
        return {
            width: (w * sx) / pixelsPerFoot,
            height: (h * sy) / pixelsPerFoot,
        };
    }

    /** Get current edges in pixels (excludes stroke, consistent with getDimensions) */
    getEdges(): { l: number; r: number; t: number; b: number } {
        const sx = this.scaleX || 1,
            sy = this.scaleY || 1;
        // Use raw width/height to exclude strokeWidth, matching getDimensions
        const w =
            (this.shapeObject.width || 0) * (this.shapeObject.scaleX || 1) * sx;
        const h =
            (this.shapeObject.height || 0) *
            (this.shapeObject.scaleY || 1) *
            sy;
        const cx = this.left || 0,
            cy = this.top || 0;
        return { l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 };
    }

    /** Apply new edges, recalculating scale and position (raw width/height, excludes stroke) */
    setEdges(edges: { l: number; r: number; t: number; b: number }) {
        const baseW =
            (this.shapeObject.width || 0) * (this.shapeObject.scaleX || 1);
        const baseH =
            (this.shapeObject.height || 0) * (this.shapeObject.scaleY || 1);
        const w = edges.r - edges.l,
            h = edges.b - edges.t;
        if (w > 10 && h > 10) {
            this.scaleX = w / baseW;
            this.scaleY = h / baseH;
            this.left = (edges.l + edges.r) / 2;
            this.top = (edges.t + edges.b) / 2;
            this.setCoords();
        }
    }

    /** Override scale to allow scaling (unlike marchers which prevent it) */
    scale(value: number): this {
        return fabric.Group.prototype.scale.call(this, value) as this;
    }
}
