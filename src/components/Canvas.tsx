import React, { useRef, useEffect, useCallback } from "react";
import { fabric } from "fabric";
import { linearEasing } from "../utils";
import { useMarcherStore, usePageStore, useMarcherPageStore } from "../stores/Store";
import { useSelectedPage } from "../context/SelectedPageContext";
import { useSelectedMarcher } from "../context/SelectedMarcherContext";
import { IGroupOptions } from "fabric/fabric-impl";
import { Constants, idForHtmlToId } from "../Constants";
import { getFieldProperties, updateMarcherPage } from "../api/api";
import * as CanvasUtils from "../utilities/CanvasUtils";
import { CanvasMarcher, FieldProperties } from "../Interfaces";

interface IGroupOptionsWithId extends IGroupOptions {
    id_for_html: string | number;
}

function Canvas() {
    const { marchers, marchersAreLoading } = useMarcherStore()!;
    const { pagesAreLoading, pages } = usePageStore()!;
    const { marcherPages, marcherPagesAreLoading, fetchMarcherPages } = useMarcherPageStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarcher, setSelectedMarcher } = useSelectedMarcher()!;
    // const [canvasState, setCanvas] = React.useState<fabric.Canvas | any>();
    const [isLoading, setIsLoading] = React.useState<boolean>(true);
    const [canvasMarchers] = React.useState<CanvasMarcher[]>([]);
    const canvas = useRef<fabric.Canvas | any>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fieldProperties = useRef<FieldProperties>();

    /* -------------------------- Listener Functions -------------------------- */
    const handleObjectModified = useCallback((e: any) => {
        const newCoords = CanvasUtils.canvasMarcherToDotCoords(e.target as fabric.Group);

        if (e.target?.id_for_html && newCoords?.x && newCoords?.y) {
            const id = idForHtmlToId(e.target.id_for_html);
            // const marcherPage = marcherPages.find((marcherPage) => marcherPage.marcher_id === id);
            updateMarcherPage(id, selectedPage!.id, newCoords.x, newCoords.y).then(() => { fetchMarcherPages() });
        } else {
            console.error("Marcher or fabric object not found - handleObjectModified: Canvas.tsx");
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

    const handleMouseDown = useCallback((opt: any) => {
        // console.log("canvas.current click location", opt.e);
        var evt = opt.e;
        if ((evt.altKey || !opt.target || !opt.target.id_for_html) && !evt.shiftKey) {
            canvas.current.isDragging = true;
            canvas.current.selection = false;
            canvas.current.lastPosX = evt.clientX;
            canvas.current.lastPosY = evt.clientY;
        }
    }, []);

    const handleMouseMove = useCallback((opt: any) => {
        if (canvas.current.isDragging) {
            var e = opt.e;
            var vpt = canvas.current.viewportTransform;
            vpt[4] += e.clientX - canvas.current.lastPosX;
            vpt[5] += e.clientY - canvas.current.lastPosY;
            canvas.current.requestRenderAll();
            canvas.current.lastPosX = e.clientX;
            canvas.current.lastPosY = e.clientY;
        }
    }, []);

    const handleMouseUp = useCallback((opt: any) => {
        // on mouse up we want to recalculate new interaction
        // for all objects, so we call setViewportTransform
        canvas.current.setViewportTransform(canvas.current.viewportTransform);
        canvas.current.isDragging = false;
        canvas.current.selection = true;
    }, []);

    const handleMouseWheel = useCallback((opt: any) => {
        // if (opt.e.shiftKey)
        //     opt.e.preventDefault();
        var delta = opt.e.deltaY;
        var zoom = canvas.current.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 20) zoom = 20;
        if (zoom < 0.01) zoom = 0.01;
        canvas.current.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
    }, []);

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
        }
    }, [handleObjectModified, handleSelect, handleDeselect, handleMouseDown, handleMouseMove, handleMouseUp,
        handleMouseWheel]);


    const cleanupListeners = useCallback(() => {
        if (canvas.current) {
            canvas.current.off('object:modified');
            canvas.current.off('selection:updated');
            canvas.current.off('selection:created');
            canvas.current.off('selection:cleared');

            canvas.current.off('mouse:down');
            canvas.current.off('mouse:move');
            canvas.current.off('mouse:up');
            canvas.current.off('mouse:wheel');
        }
    }, []);

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
                    CanvasUtils.setCanvasMarcherCoordsFromDot(canvasMarcher, marcherPage.x, marcherPage.y);
                    // console.log("canvasMarcher:", canvasMarcher);
                    // canvasMarcher.fabricObject!.left = marcherPage.x;
                    // canvasMarcher.fabricObject!.top = marcherPage.y;
                    // canvasMarcher.fabricObject!.setCoords();
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
        console.log(marchers, pages, marcherPages, selectedPage, isLoading, canvasMarchers)
        if (!canvas.current && selectedPage && canvasRef.current) {
            // console.log("Canvas.tsx: useEffect: create canvas.current");
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


            canvas.current.renderAll()
        }
    }, [selectedPage]);

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
        // console.log("UseEffect: renderMarchers - marchers", selectedPage);
        if (canvas.current && !isLoading) {
            updateMarcherLabels();
        }
    }, [marchers, isLoading, updateMarcherLabels]);

    // Update/render the marchers when the selected page or the marcher pages change
    useEffect(() => {
        // console.log("UseEffect: renderMarchers - pages", selectedPage);
        if (canvas.current && !isLoading) {
            // console.log("Rendering canvas.current - pages");
            renderMarchers();
        }
    }, [marchers, pages, marcherPages, selectedPage, isLoading, renderMarchers]);

    // Change the active object when the selected marcher changes
    useEffect(() => {
        if (canvas.current && !isLoading && canvasMarchers.length > 0 && selectedMarcher) {
            const curMarcher = canvasMarchers.find((canvasMarcher) => canvasMarcher.marcher_id === selectedMarcher.id);
            if (curMarcher && curMarcher.fabricObject) {
                canvas.current.setActiveObject(curMarcher.fabricObject);
            }
            else
                throw new Error("Marcher or fabric object not found - renderMarchers: Canvas.tsx");
        }
    }, [selectedMarcher, isLoading, canvasMarchers]);

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
