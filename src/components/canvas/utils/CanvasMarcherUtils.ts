import { Constants } from "@/global/Constants";
import { CanvasMarcher, MarcherPage } from "@/global/Interfaces";
import { Marcher } from "@/global/classes/Marcher";
import { Page } from "@/global/classes/Page";
import { fabric } from "fabric";
import { IGroupOptions } from "fabric/fabric-impl";

interface IGroupOptionsWithId extends IGroupOptions {
    id_for_html: string | number;
}
/**
 * TODO, write this doc comment and replace the contents in the setCanvasMarcherCoordsFromDot function with this
 */
export const realCoordsToCanvasCoords = ({ canvasMarcher, x, y }: { canvasMarcher: CanvasMarcher; x: number; y: number; }) => {
    // The offset that the dot is from the fabric group coordinate.
    if (!(canvasMarcher?.fabricObject)) {
        console.error("FabricObject does not exist for the marcher - realCoordsToCanvasCoords: CanvasUtils.tsx");
        return null;
    }
    let offset = { x: 0, y: 0 };
    const fabricGroup = canvasMarcher.fabricObject;
    const dot = (canvasMarcher.fabricObject as fabric.Group)._objects[0] as fabric.Circle;
    if (dot.left && dot.top && fabricGroup.width && fabricGroup.height) {
        // Dot center - radius - offset - 1/2 fieldWidth or fieldHeight of the fabric group
        const newCoords = {
            x: (x - Constants.dotRadius - dot.left - (fabricGroup.width / 2)) - offset.x,
            y: (y - Constants.dotRadius - dot.top - (fabricGroup.height / 2)) - offset.y
        };
        return newCoords;
    } else {
        console.error("Marcher dot does not have left or top properties, or fabricGroup does not have fieldHeight/width - setCanvasMarcherCoordsFromDot: CanvasUtils.tsx");
        return null;
    }
}

/**
* Updates the coordinates of a CanvasMarcher object.
* This compensates for the fabric group offset and ensures the coordinate is where the dot itself is located.
* The fabric group to represent the dot is offset up and to the left a bit.
*
* @param marcher The CanvasMarcher object to update.
* @param x the x location of the actual dot
* @param y the y location of the actual dot.
*/
export const setCanvasMarcherCoordsFromDot = ({ marcher, x, y }: { marcher: CanvasMarcher; x: number; y: number; }) => {
    if (!(marcher?.fabricObject)) {
        console.error("FabricObject does not exist for the marcher - setCanvasMarcherCoordsFromDot: CanvasUtils.tsx");
        return;
    }
    // Check if the fabric object is part of a group
    let offset = { x: 0, y: 0 };
    if (marcher.fabricObject.group) {
        const parentGroup = marcher.fabricObject.group;
        if (parentGroup && parentGroup.left && parentGroup.top
            && parentGroup.width && parentGroup.height) {
            offset = {
                x: parentGroup.left + (parentGroup.width / 2),
                y: parentGroup.top + (parentGroup.height / 2)
            };
        }
    }

    // The offset that the dot is from the fabric group coordinate.
    const fabricGroup = marcher.fabricObject;
    const dot = (marcher.fabricObject as fabric.Group)._objects[0] as fabric.Circle;
    if (dot.left && dot.top && fabricGroup.width && fabricGroup.height) {
        // Dot center - radius - offset - 1/2 fieldWidth or fieldHeight of the fabric group
        const newCoords = {
            x: (x - Constants.dotRadius - dot.left - (fabricGroup.width / 2)) - offset.x,
            y: (y - Constants.dotRadius - dot.top - (fabricGroup.height / 2)) - offset.y
        };

        marcher.fabricObject.left = newCoords.x;
        marcher.fabricObject.top = newCoords.y;
        marcher.fabricObject.setCoords();
    } else
        console.error("Marcher dot does not have left or top properties, or fabricGroup does not have fieldHeight/width - setCanvasMarcherCoordsFromDot: CanvasUtils.tsx");
}

export const createMarcher = ({ canvas, canvasMarchers, x, y, id_for_html, marcher_id, label }: { canvas: fabric.Canvas; canvasMarchers: CanvasMarcher[]; x: number; y: number; id_for_html: string; marcher_id: number; label?: string; }):
    CanvasMarcher => {

    const newMarcherCircle = new fabric.Circle({
        left: x - Constants.dotRadius,
        top: y - Constants.dotRadius,
        fill: "red",
        radius: Constants.dotRadius,
    });

    const marcherLabel = new fabric.Text(label || "nil", {
        top: y - 22,
        fontFamily: "courier",
        fontSize: 14,
    });
    marcherLabel.left = x - marcherLabel!.width! / 2;

    const marcherGroup = new fabric.Group([newMarcherCircle, marcherLabel], {
        id_for_html: id_for_html,
        hasControls: false,
        hasBorders: true,
        lockRotation: true,
        hoverCursor: "pointer",
    } as IGroupOptionsWithId);

    const newMarcher = {
        fabricObject: marcherGroup,
        x: x,
        y: y,
        id_for_html: id_for_html,
        drill_number: label || "nil",
        marcher_id: marcher_id
    }
    canvasMarchers.push(newMarcher);
    canvas.add(marcherGroup);
    return newMarcher;
}

/* Create new marchers based on the selected page if they haven't been created yet */
// Moves the current marchers to the new page
export const renderMarchers = ({ canvas, marchers, selectedPage, canvasMarchers, marcherPages }:
    { canvas: fabric.Canvas; marchers: Marcher[]; selectedPage: Page; canvasMarchers: CanvasMarcher[]; marcherPages: MarcherPage[]; }) => {

    const curMarcherPages = marcherPages.filter((marcherPage) => marcherPage.page_id === selectedPage?.id);
    curMarcherPages.forEach((marcherPage) => {
        // Marcher does not exist on the Canvas, create a new one
        if (!canvasMarchers.find((canvasMarcher) => canvasMarcher.marcher_id === marcherPage.marcher_id)) {
            const curMarcher = marchers.find((marcher) => marcher.id === marcherPage.marcher_id);
            if (curMarcher)
                createMarcher({ canvas, canvasMarchers, x: marcherPage.x, y: marcherPage.y, id_for_html: curMarcher.id_for_html, marcher_id: curMarcher.id, label: curMarcher.drill_number });
            else
                throw new Error("Marcher not found - renderMarchers: Canvas.tsx");
        }
        // Marcher does exist on the Canvas, move it to the new location if it has changed
        else {
            const canvasMarcher = canvasMarchers.find(
                (canvasMarcher) => canvasMarcher.marcher_id === marcherPage.marcher_id);

            if (canvasMarcher && canvasMarcher.fabricObject) {
                setCanvasMarcherCoordsFromDot({ marcher: canvasMarcher, x: marcherPage.x, y: marcherPage.y });
            } else
                throw new Error("Marcher or fabric object not found - renderMarchers: Canvas.tsx");
        }
    });
    canvas.renderAll();
}

export const updateMarcherLabels = ({ canvas, marchers, canvasMarchers }:
    { marchers: Marcher[]; canvasMarchers: CanvasMarcher[]; canvas: fabric.Canvas; }) => {

    canvasMarchers.forEach((canvasMarcher) => {
        if (canvasMarcher.fabricObject instanceof fabric.Group) {
            canvasMarcher.drill_number =
                marchers.find((marcher) => marcher.id === canvasMarcher.marcher_id)?.drill_number || "nil";
            const textObject = canvasMarcher.fabricObject._objects[1] as fabric.Text;
            if (textObject.text !== canvasMarcher.drill_number)
                textObject.set({ text: canvasMarcher.drill_number });
        }
    });
    canvas?.renderAll();
}

/**
* A function to get the coordinates of a fabric marcher's dot.
* The coordinate on the canvas is different than the coordinate of the actual dot.
*
* @param fabricGroup - the fabric object of the canvas marcher
* @returns The real coordinates of the CanvasMarcher dot. {x: number, y: number}
*/
export const fabricObjectToRealCoords = ({ canvas, fabricGroup }:
    { canvas: fabric.Canvas; fabricGroup: fabric.Group; }) => {

    /* If multiple objects are selected, offset the coordinates by the group's center
   Active object coordinates in fabric are the relative coordinates
   to the group's center when multiple objects are selected */
    if (!(fabricGroup as any).id_for_html) {
        console.error("fabricGroup does not have id_for_html property - fabricObjectToRealCoords: CanvasUtils.tsx");
        return null;
    }

    const idForHtml = (fabricGroup as any).id_for_html;

    // Check if multiple marchers are selected and if the current marcher is one of them
    let offset = { x: 0, y: 0 };
    const isActiveObject = canvas.getActiveObjects().some((canvasObject: any) => canvasObject.id_for_html === idForHtml);
    if (canvas.getActiveObjects().length > 1 && isActiveObject) {
        // && selectedMarchers.some((selectedMarcher) => selectedMarcher.id_for_html === idForHtml)) {
        const groupObject = canvas.getActiveObject();
        offset = {
            x: (groupObject?.left || 0) + ((groupObject?.width || 0) / 2),
            y: (groupObject?.top || 0) + ((groupObject?.height || 0) / 2)
        };
    }

    const dot = fabricGroup?._objects[0] as fabric.Circle;
    if (fabricGroup.left && fabricGroup.top && dot.left && dot.top) {
        return {
            x: offset.x + fabricGroup.getCenterPoint().x + dot.left + Constants.dotRadius,
            y: offset.y + fabricGroup.getCenterPoint().y + dot.top + Constants.dotRadius
        };
    }
    console.error("Marcher dot or fabricGroup does not have left or top properties - fabricObjectToRealCoords: CanvasUtils.tsx");

    return null;
}
