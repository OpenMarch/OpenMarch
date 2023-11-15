import React, { useRef, useEffect, useCallback } from "react";
import { fabric } from "fabric";
// import { linearEasing } from "../utils";
import { useMarcherStore, usePageStore, useMarcherPageStore } from "../stores/Store";
import { useSelectedPage } from "../context/SelectedPageContext";
import { useSelectedMarcher } from "../context/SelectedMarcherContext";
import { IGroupOptions } from "fabric/fabric-impl";
import { idForHtmlToId } from "../Constants";
import { updateMarcherPage } from "../api/api";
import * as CanvasUtils from "../utilities/CanvasUtils";
import { CanvasMarcher } from "../Interfaces";

interface IGroupOptionsWithId extends IGroupOptions {
    id_for_html: string | number;
}

// All dimensions are in tenth steps (2.25 inches)
const canvasDimensions = {
    footballField: { width: 1600, height: 854, name: "Football Field", actualHeight: 840 },
};

function Canvas() {
    const { marchers, marchersAreLoading } = useMarcherStore()!;
    const { pagesAreLoading } = usePageStore()!;
    const { marcherPages, marcherPagesAreLoading, fetchMarcherPages } = useMarcherPageStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarcher, setSelectedMarcher } = useSelectedMarcher()!;
    const [canvas, setCanvas] = React.useState<fabric.Canvas | any>();
    const [isLoading, setIsLoading] = React.useState<boolean>(true);
    const [canvasMarchers] = React.useState<CanvasMarcher[]>([]);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    //   const rootStore = useStore();
    //   const { UIStore } = rootStore;

    /* -------------------------- Listener Functions -------------------------- */
    const handleObjectModified = useCallback((e: any) => {
        // console.log("handleObjectModified:", e.target);
        // console.log('selectedPage:', selectedPage);
        const target = e.target;
        if (e.target?.id_for_html && e.target?.left && e.target?.top) {
            const id = idForHtmlToId(e.target.id_for_html);
            // const marcherPage = marcherPages.find((marcherPage) => marcherPage.marcher_id === id);
            updateMarcherPage(id, selectedPage!.id, target.left, target.top).then(() => { fetchMarcherPages() });
        }
    }, [selectedPage, fetchMarcherPages]);

    // Set the selected marcher when selected element changes
    const handleSelect = useCallback((e: any) => {
        // console.log("handleSelect:", e.selected);

        // Check if it is a single selected element rather than a group
        if (e.selected?.length === 1 && e.selected[0].id_for_html) {
            const id_for_html = e.selected[0].id_for_html;
            setSelectedMarcher(marchers.find((marcher) => marcher.id_for_html === id_for_html) || null);
        }
    }, [marchers, setSelectedMarcher]);

    // Deselect the marcher when the selection is cleared
    const handleDeselect = useCallback((e: any) => {
        // console.log("handleDeselect:", e.deselected);

        if (e.deselected) { setSelectedMarcher(null); }
    }, [setSelectedMarcher]);

    const refreshListeners = useCallback(() => {
        if (canvas) {
            // Updates the objectModified listener so it is on the correct page
            // TODO is there a better way to do this?
            canvas.off('object:modified');
            canvas.on('object:modified', handleObjectModified);
        }
    }, [canvas, handleObjectModified]);

    const cleanupListeners = useCallback(() => {
        if (canvas) {
            canvas.off('object:modified');

            canvas.off('selection:updated');
            canvas.off('selection:created');
            canvas.off('selection:cleared');
        }
    }, [canvas]);

    /* ------------------------ Marcher Functions ------------------------ */
    const createMarcher = useCallback((x: number, y: number, id_for_html: string, marcher_id: number, label?: string):
        CanvasMarcher => {
        let radius = 5;

        const newMarcherCircle = new fabric.Circle({
            left: x - radius,
            top: y - radius,
            fill: "red",
            radius: radius,
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
        canvas!.add(marcherGroup);
        return newMarcher;
    }, [canvas, canvasMarchers]);

    /* Create new marchers based on the selected page if they haven't been created yet */
    // Moves the current marchers to the new page
    const renderMarchers = useCallback(() => {
        const curMarcherPages = marcherPages.filter((marcherPage) => marcherPage.page_id === selectedPage?.id);
        // console.log("renderMarchers:", canvasMarchers, marcherPages, selectedPage, curMarcherPages);
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
                    canvasMarcher.fabricObject!.left = marcherPage.x;
                    canvasMarcher.fabricObject!.top = marcherPage.y;
                    canvasMarcher.fabricObject!.setCoords();
                } else
                    throw new Error("Marcher or fabric object not found - renderMarchers: Canvas.tsx");
            }
        });
        canvas!.renderAll();
    }, [marchers, canvasMarchers, canvas, marcherPages, selectedPage, createMarcher]);

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
        canvas?.renderAll();
    }, [marchers, canvasMarchers, canvas]);

    /* -------------------------- useEffects -------------------------- */
    // Set Loading
    useEffect(() => {
        setIsLoading(marchersAreLoading || pagesAreLoading || marcherPagesAreLoading);
    }, [pagesAreLoading, marcherPagesAreLoading, marchersAreLoading]);

    /* Initialize the canvas */
    // Update the objectModified listener when the selected page changes
    useEffect(() => {
        if (!canvas && selectedPage && canvasRef.current) {
            // console.log("Canvas.tsx: useEffect: create canvas");
            setCanvas(new fabric.Canvas(canvasRef.current, {}));

            // Handle window resize event
            // window.addEventListener("resize", buildField);

            // Clean up event listener on component unmount
            // return () => {
            //     window.removeEventListener("resize", buildField);
            // };‰
        }
        if (canvas) {
            refreshListeners();
        }
    }, [selectedPage, canvas, refreshListeners]);

    // Create the canvas and field
    useEffect(() => {
        if (canvas) {
            // Set canvas size
            canvas.setDimensions(canvasDimensions.footballField);

            // Set canvas configuration options
            canvas.backgroundColor = "white";
            canvas.selectionColor = "white";
            canvas.selectionLineWidth = 8;
            canvas.crisp = true;

            // set initial canvas size
            const staticGrid = CanvasUtils.buildField(canvasDimensions.footballField);
            canvas.add(staticGrid);

            // const cleanupListenersCall = () => initCanvasCallack.current();
        }
    }, [canvas]);

    // Initiate listeners
    useEffect(() => {
        if (canvas) {
            // Initiate listeners
            canvas.on('object:modified', handleObjectModified);
            canvas.on('selection:updated', handleSelect);
            canvas.on('selection:created', handleSelect);
            canvas.on('selection:cleared', handleDeselect);
            canvas.on('mouse:down', function (opt: any) {
                var evt = opt.e;
                if (evt.altKey) {
                    canvas.isDragging = true;
                    canvas.selection = false;
                    canvas.lastPosX = evt.clientX;
                    canvas.lastPosY = evt.clientY;
                }
            });
            canvas.on('mouse:move', function (opt: any) {
                if (canvas.isDragging) {
                    var e = opt.e;
                    var vpt = canvas.viewportTransform;
                    vpt[4] += e.clientX - canvas.lastPosX;
                    vpt[5] += e.clientY - canvas.lastPosY;
                    canvas.requestRenderAll();
                    canvas.lastPosX = e.clientX;
                    canvas.lastPosY = e.clientY;
                }
            });
            canvas.on('mouse:up', function (opt: any) {
                // on mouse up we want to recalculate new interaction
                // for all objects, so we call setViewportTransform
                canvas.setViewportTransform(canvas.viewportTransform);
                canvas.isDragging = false;
                canvas.selection = true;
            });
            canvas.on('mouse:wheel', function (opt: any) {
                // if (opt.e.shiftKey)
                //     opt.e.preventDefault();
                var delta = opt.e.deltaY;
                var zoom = canvas.getZoom();
                zoom *= 0.999 ** delta;
                if (zoom > 20) zoom = 20;
                if (zoom < 0.01) zoom = 0.01;
                canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
                opt.e.preventDefault();
                opt.e.stopPropagation();
            });

            // Cleanup
            return () => {
                cleanupListeners();
            }
        }
    }, [canvas, handleObjectModified, handleSelect, handleDeselect, cleanupListeners]);


    // Render the marchers when the canvas and marchers are loaded
    useEffect(() => {
        // console.log("UseEffect: renderMarchers - marchers", selectedPage);
        if (canvas && !isLoading) {
            updateMarcherLabels();
        }
    }, [marchers, canvas, isLoading, updateMarcherLabels]);

    // Update/render the marchers when the selected page or the marcher pages change
    useEffect(() => {
        // console.log("UseEffect: renderMarchers - pages", selectedPage);
        if (canvas && !isLoading) {
            // console.log("Rendering canvas - pages");
            renderMarchers();
        }
    }, [canvas, marchers, marcherPages, selectedPage, isLoading, renderMarchers]);

    // Change the active object when the selected marcher changes
    useEffect(() => {
        if (canvas && !isLoading && canvasMarchers.length > 0 && selectedMarcher) {
            const curMarcher = canvasMarchers.find((canvasMarcher) => canvasMarcher.marcher_id === selectedMarcher.id);
            if (curMarcher && curMarcher.fabricObject) {
                canvas.setActiveObject(curMarcher.fabricObject);
            }
            else
                throw new Error("Marcher or fabric object not found - renderMarchers: Canvas.tsx");
        }
    }, [selectedMarcher, canvas, isLoading, canvasMarchers]);

    // -------------------------- Animation Functions --------------------------
    // const startAnimation = () => {
    //     if (canvas) {
    //         // canvasMarchers[0]?.animate("down", "+=100", { onChange: canvas.renderAll.bind(canvas) });
    //         canvasMarchers.forEach((CanvasMarcher) => {
    //             const matrix = CanvasMarcher?.fabricObject?.calcTransformMatrix();
    //             CanvasMarcher?.fabricObject?.animate({
    //                 left: `${matrix![4]}`,
    //                 top: `${matrix![5]}+100`,
    //             }, {
    //                 duration: 1000,
    //                 onChange: canvas!.renderAll.bind(canvas),
    //                 easing: linearEasing,
    //             });
    //         });
    //     }
    // };

    return (
        <div className="canvas-container">
            <canvas ref={canvasRef} id="fieldCanvas" className="field-canvas" />
        </div>
    );
};

export default Canvas;
