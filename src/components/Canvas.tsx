import React, { useRef, useEffect, useCallback } from "react";
import { fabric } from "fabric";
import { linearEasing } from "../utils";
import { useMarcherStore, usePageStore, useMarcherPageStore } from "../stores/Store";
import { useSelectedPage } from "../context/SelectedPageContext";
import { useSelectedMarchers } from "../context/SelectedMarchersContext";
import { IGroupOptions } from "fabric/fabric-impl";
import { Constants, idForHtmlToId } from "../Constants";
import { getFieldProperties, updateMarcherPage, updateMarcherPages } from "../api/api";
import * as CanvasUtils from "../utilities/CanvasUtils";
import { CanvasMarcher, FieldProperties, UpdateMarcherPage } from "../Interfaces";

interface IGroupOptionsWithId extends IGroupOptions {
    id_for_html: string | number;
}

const keyActions = {
    lockX: "z",
    lockY: "x",
}

function Canvas() {
    const { marchers, marchersAreLoading } = useMarcherStore()!;
    const { pagesAreLoading, pages } = usePageStore()!;
    const { marcherPages, marcherPagesAreLoading, fetchMarcherPages } = useMarcherPageStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const [isLoading, setIsLoading] = React.useState<boolean>(true);
    const [canvasMarchers] = React.useState<CanvasMarcher[]>([]);
    const canvas = useRef<fabric.Canvas | any>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fieldProperties = useRef<FieldProperties>();

    /* -------------------------- Listener Functions -------------------------- */
    const handleObjectModified = useCallback((e: any) => {
        const activeObjects = canvas.current.getActiveObjects();

        const changes: UpdateMarcherPage[] = [];
        activeObjects.forEach((activeObject: any) => {
            const newCoords = fabricObjectToRealCoords(activeObject as fabric.Group);
            if (activeObject.id_for_html && newCoords?.x && newCoords?.y) {
                const marcherId = idForHtmlToId(activeObject.id_for_html);
                changes.push({ marcher_id: marcherId, page_id: selectedPage!.id, x: newCoords.x, y: newCoords.y });
                // updateMarcherPage(
                //     marcherId, selectedPage!.id,
                //     newCoords.x,
                //     newCoords.y)
                //     .then(() => { fetchMarcherPages() });
            } else {
                console.error("Marcher or fabric object not found - handleObjectModified: Canvas.tsx");
            }
        });
        updateMarcherPages(changes).then(() => { fetchMarcherPages() });
    }, [selectedPage, fetchMarcherPages, selectedMarchers]);

    /**
     * Set the selected marcher when selected element changes
     */
    const handleSelect = useCallback((e: any) => {
        const newSelectedMarchers = marchers.filter((marcher) => canvas.current.getActiveObjects()
            .some((selected: any) => selected.id_for_html === marcher.id_for_html))
            || []; // If no marchers are selected, set the selected marchers to an empty array
        setSelectedMarchers(newSelectedMarchers);

    }, [marchers, setSelectedMarchers]);

    /**
     * Deselect the marcher when the selection is cleared
     */
    const handleDeselect = useCallback((e: any) => {
        if (e.deselected) { setSelectedMarchers([]); }
    }, [setSelectedMarchers]);

    /**
     * Set the canvas to dragging mode on mousedown.
     */
    const handleMouseDown = (opt: any) => {
        var evt = opt.e;
        // opt.target checks if the mouse is on the canvas at all
        // Don't move the canvas if the mouse is on a marcher
        const isMarcherSelection = opt.target && (opt.target?.id_for_html || opt.target._objects?.some((obj: any) => obj.id_for_html));
        if (!isMarcherSelection && !evt.shiftKey) {
            canvas.current.isDragging = true;
            canvas.current.selection = false;
            canvas.current.lastPosX = evt.clientX;
            canvas.current.lastPosY = evt.clientY;
        }
    };

    /**
     * Move the canvas on mousemove when in dragging mode
     */
    const handleMouseMove = (opt: any) => {
        if (canvas.current.isDragging) {
            var e = opt.e;
            var vpt = canvas.current.viewportTransform;
            vpt[4] += e.clientX - canvas.current.lastPosX;
            vpt[5] += e.clientY - canvas.current.lastPosY;
            canvas.current.requestRenderAll();
            canvas.current.lastPosX = e.clientX;
            canvas.current.lastPosY = e.clientY;
        }
    };

    /**
     * Disable dragging mode on mouseup.
     */
    const handleMouseUp = (opt: any) => {
        // on mouse up we want to recalculate new interaction
        // for all objects, so we call setViewportTransform
        canvas.current.setViewportTransform(canvas.current.viewportTransform);
        canvas.current.isDragging = false;
        canvas.current.selection = true;
    };

    /**
     * Zoom in and out with the mouse wheel
     */
    const handleMouseWheel = (opt: any) => {
        var delta = opt.e.deltaY;
        var zoom = canvas.current.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 25) zoom = 25;
        if (zoom < 0.35) zoom = 0.35;
        canvas.current.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
    };

    /**
     * Keydown and Keyup handler
     *
     * @param e
     * @param keydown true if keydown, false if keyup
     */
    const handleKey = (e: KeyboardEvent, keydown: boolean) => {
        return;
        const canvasObjects = canvas.current.getObjects();
        if (canvas.current && canvas.current.getObjects().length > 0) {
            switch (e.key) {
                case keyActions.lockY:
                    canvasObjects.forEach((selected: any) => {
                        selected.lockMovementY = keydown;
                    });
                    break;
                case keyActions.lockX:
                    canvasObjects.forEach((selected: any) => {
                        selected.lockMovementX = keydown;
                    });
                    break;
            }
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        handleKey(e, true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
        handleKey(e, false);
    };

    const initiateListeners = useCallback(() => {
        if (canvas.current) {
            canvas.current.on('object:modified', handleObjectModified);
            canvas.current.on('selection:updated', handleSelect);
            canvas.current.on('selection:created', handleSelect);
            canvas.current.on('selection:cleared', handleDeselect);

            canvas.current.on('mouse:down', handleMouseDown);
            canvas.current.on('mouse:move', handleMouseMove);
            canvas.current.on('mouse:up', handleMouseUp);
            canvas.current.on('mouse:wheel', handleMouseWheel);

            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keyup', handleKeyUp);
        }
    }, [handleObjectModified, handleSelect, handleDeselect, handleMouseDown, handleMouseMove, handleMouseUp,
        handleMouseWheel]);


    const cleanupListeners = () => {
        if (canvas.current) {
            canvas.current.off('object:modified');
            canvas.current.off('selection:updated');
            canvas.current.off('selection:created');
            canvas.current.off('selection:cleared');

            canvas.current.off('mouse:down');
            canvas.current.off('mouse:move');
            canvas.current.off('mouse:up');
            canvas.current.off('mouse:wheel');

            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        }
    };

    /* ------------------------ Marcher Functions ------------------------ */
    const createMarcher = useCallback((x: number, y: number, id_for_html: string, marcher_id: number, label?: string):
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
        canvas.current!.add(marcherGroup);
        return newMarcher;
    }, [canvasMarchers]);

    /* Create new marchers based on the selected page if they haven't been created yet */
    // Moves the current marchers to the new page
    const renderMarchers = useCallback(() => {
        const curMarcherPages = marcherPages.filter((marcherPage) => marcherPage.page_id === selectedPage?.id);
        curMarcherPages.forEach((marcherPage) => {
            // Marcher does not exist on the Canvas, create a new one
            if (!canvasMarchers.find((canvasMarcher) => canvasMarcher.marcher_id === marcherPage.marcher_id)) {
                const curMarcher = marchers.find((marcher) => marcher.id === marcherPage.marcher_id);
                if (curMarcher)
                    createMarcher(
                        marcherPage.x, marcherPage.y, curMarcher.id_for_html, curMarcher.id, curMarcher.drill_number);
                else
                    throw new Error("Marcher not found - renderMarchers: Canvas.tsx");
            }
            // Marcher does exist on the Canvas, move it to the new location if it has changed
            else {
                const canvasMarcher = canvasMarchers.find(
                    (canvasMarcher) => canvasMarcher.marcher_id === marcherPage.marcher_id);

                if (canvasMarcher && canvasMarcher.fabricObject) {
                    setCanvasMarcherCoordsFromDot(canvasMarcher, marcherPage.x, marcherPage.y);
                } else
                    throw new Error("Marcher or fabric object not found - renderMarchers: Canvas.tsx");
            }
        });
        canvas.current!.renderAll();
    }, [marchers, canvasMarchers, marcherPages, selectedPage, createMarcher]);

    const updateMarcherLabels = useCallback(() => {
        canvasMarchers.forEach((canvasMarcher) => {
            if (canvasMarcher.fabricObject instanceof fabric.Group) {
                canvasMarcher.drill_number =
                    marchers.find((marcher) => marcher.id === canvasMarcher.marcher_id)?.drill_number || "nil";
                const textObject = canvasMarcher.fabricObject._objects[1] as fabric.Text;
                if (textObject.text !== canvasMarcher.drill_number)
                    textObject.set({ text: canvasMarcher.drill_number });
            }
        });
        canvas.current?.renderAll();
    }, [marchers, canvasMarchers]);


    /**
     * Updates the coordinates of a CanvasMarcher object.
     * This compensates for the fabric group offset and ensures the coordinate is where the dot itself is located.
     * The fabric group to represent the dot is offset up and to the left a bit.
     *
     * @param marcher The CanvasMarcher object to update.
     * @param x the x location of the actual dot
     * @param y the y location of the actual dot.
     */
    const setCanvasMarcherCoordsFromDot = useCallback((marcher: CanvasMarcher, x: number, y: number) => {
        /* If multiple objects are selected, offset the coordinates by the group's center
           Active object coordinates in fabric are the relative coordinates
           to the group's center when multiple objects are selected */
        // Check if multople marchers are selected and if the current marcher is one of them
        let offset = { x: 0, y: 0 };
        const isActiveObject = canvas.current.getActiveObjects().some((canvasObject: any) => canvasObject.id_for_html === marcher.id_for_html);
        if (canvas.current.getActiveObjects().length > 1 && isActiveObject) {
            const groupObject = canvas.current.getActiveObject();
            offset = {
                x: groupObject.left + (groupObject.width / 2),
                y: groupObject.top + (groupObject.height / 2)
            };
        }

        if (marcher?.fabricObject) {
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
        } else
            console.error("FabricObject does not exist for the marcher - setCanvasMarcherCoordsFromDot: CanvasUtils.tsx");

        return null;
    }, []);

    /**
     * A function to get the coordinates of a fabric marcher's dot.
     * The coordinate on the canvas is different than the coordinate of the actual dot.
     *
     * @param fabricGroup - the fabric object of the canvas marcher
     * @returns The real coordinates of the CanvasMarcher dot. {x: number, y: number}
     */
    const fabricObjectToRealCoords = useCallback((fabricGroup: fabric.Group) => {
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
        const isActiveObject = canvas.current.getActiveObjects().some((canvasObject: any) => canvasObject.id_for_html === idForHtml);
        if (canvas.current.getActiveObjects().length > 1 && isActiveObject) {
            // && selectedMarchers.some((selectedMarcher) => selectedMarcher.id_for_html === idForHtml)) {
            const groupObject = canvas.current.getActiveObject();
            offset = {
                x: groupObject.left + (groupObject.width / 2),
                y: groupObject.top + (groupObject.height / 2)
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
    }, [selectedMarchers]);

    /* -------------------------- useEffects -------------------------- */
    useEffect(() => {
        getFieldProperties().then((fieldPropertiesResult) => {
            fieldProperties.current = fieldPropertiesResult;
        });
    }, []);

    // Set Loading
    useEffect(() => {
        setIsLoading(marchersAreLoading || pagesAreLoading || marcherPagesAreLoading);
    }, [pagesAreLoading, marcherPagesAreLoading, marchersAreLoading]);

    /* Initialize the canvas.current */
    // Update the objectModified listener when the selected page changes
    useEffect(() => {
        if (!canvas.current && selectedPage && canvasRef.current && fieldProperties.current) {
            canvas.current = new fabric.Canvas(canvasRef.current, {});

            // Set canvas.current size
            CanvasUtils.refreshCanavsSize(canvas.current);
            // Update canvas.current size on window resize
            window.addEventListener('resize', (evt) => {
                CanvasUtils.refreshCanavsSize(canvas.current);
            });

            // Set canvas.current configuration options
            // canvas.current.backgroundColor = getColor('$purple-200');
            canvas.current.selectionColor = "white";
            canvas.current.selectionLineWidth = 8;
            // set initial canvas.current size
            const staticGrid = CanvasUtils.buildField(fieldProperties.current!);
            canvas.current.add(staticGrid);

            // Set canvas selection color
            canvas.current.selectionColor = 'rgba(0, 0, 255, 0.2)';
            canvas.current.selectionBorderColor = 'rgba(0, 0, 255, 1)';
            canvas.current.selectionLineWidth = 2;

            canvas.current.renderAll()
        }
    }, [selectedPage, fieldProperties]);

    // Initiate listeners
    useEffect(() => {
        if (canvas.current) {
            // Initiate listeners
            initiateListeners();

            // Cleanup
            return () => {
                cleanupListeners();
            }
        }
    }, [initiateListeners, cleanupListeners]);


    // Render the marchers when the canvas.current and marchers are loaded
    useEffect(() => {
        if (canvas.current && !isLoading) {
            updateMarcherLabels();
        }
    }, [marchers, isLoading, updateMarcherLabels]);

    // Update/render the marchers when the selected page or the marcher pages change
    useEffect(() => {
        if (canvas.current && !isLoading) {
            renderMarchers();
        }
    }, [marchers, pages, marcherPages, selectedPage, isLoading, renderMarchers]);

    // TODO implement this for multiple marchers
    // Change the active object when the selected marcher changes
    // useEffect(() => {
    //     if (canvas.current && !isLoading && canvasMarchers.length > 0 && selectedMarchers.length > 1) {
    //         const curMarcher = canvasMarchers.find((canvasMarcher) => canvasMarcher.marcher_id === selectedMarchers.id);
    //         if (curMarcher && curMarcher.fabricObject) {
    //             canvas.current.setActiveObject(curMarcher.fabricObject);
    //         }
    //         else
    //             throw new Error("Marcher or fabric object not found - renderMarchers: Canvas.tsx");
    //     }
    // }, [selectedMarchers, isLoading, canvasMarchers]);

    /* --------------------------Animation Functions-------------------------- */
    // eslint-disable-next-line
    const startAnimation = () => {
        if (canvas.current) {
            // canvasMarchers[0]?.animate("down", "+=100", { onChange: canvas.current.renderAll.bind(canvas.current) });
            canvasMarchers.forEach((CanvasMarcher) => {
                const matrix = CanvasMarcher?.fabricObject?.calcTransformMatrix();
                CanvasMarcher?.fabricObject?.animate({
                    left: `${matrix![4]}`,
                    top: `${matrix![5]}+100`,
                }, {
                    duration: 1000,
                    onChange: canvas.current!.renderAll.bind(canvas.current),
                    easing: linearEasing,
                });
            });
        }
    };

    return (
        <div className="canvas-container">
            {!isLoading &&
                ((marchers.length > 0 && pages.length > 0) ?
                    <canvas ref={canvasRef} id="fieldCanvas" className="field-canvas" />
                    :
                    <div className="canvas-loading"
                        style={{
                            color: "white",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                        }}
                    >
                        <h3>To start the show, create Marchers and Pages.</h3>
                        <p>Then {"(Window -> Refresh) or (Ctrl+R)"}</p>
                        <h5>If anything in OpenMarch ever seems broken, a refresh will often fix it.</h5>
                    </div>
                )
            }
        </div>
    );
};

export default Canvas;