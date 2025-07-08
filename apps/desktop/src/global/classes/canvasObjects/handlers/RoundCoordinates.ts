import { fabric } from "fabric";
import OpenMarchCanvas from "../OpenMarchCanvas";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";

/**
 * Rounds the coordinates of an object to the nearest integer.
 * @param object - The object to round the coordinates of.
 * @param event - The event that triggered the rounding.
 * @returns The rounded coordinates.
 */
export const roundCoordinatesHandler = (
    object: fabric.Object,
    event: fabric.IEvent<MouseEvent>,
) => {
    const canvas = object.canvas;
    if (!canvas) throw new Error("Canvas is not defined");
    if (!(canvas instanceof OpenMarchCanvas))
        throw new Error("Canvas is not an OpenMarchCanvas");
    if (!object.left || !object.top)
        throw new Error("Object has no coordinates");

    const roundedCoordinates = event.e.shiftKey
        ? { xPixels: object.left, yPixels: object.top }
        : getRoundCoordinates2({
              coordinate: { xPixels: object.left, yPixels: object.top },
              fieldProperties: (canvas as OpenMarchCanvas).fieldProperties,
              uiSettings: (canvas as OpenMarchCanvas).uiSettings,
          });

    object.set({
        left: roundedCoordinates.xPixels,
        top: roundedCoordinates.yPixels,
    });
    object.setCoords();
    canvas.requestRenderAll();
    return roundedCoordinates;
};
