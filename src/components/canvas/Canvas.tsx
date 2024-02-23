/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef, useEffect, useCallback } from "react";
import { fabric } from "fabric";
import { linearEasing } from "../../global/utils";
import { useUiSettingsStore } from "../../stores/uiSettings/useUiSettingsStore";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";
import { idForHtmlToId } from "../../global/Constants";
import * as CanvasMarcherUtils from "./utils/CanvasMarcherUtils";
import { updateMarcherPages } from "../../api/api";
import * as CanvasUtils from "./utils/CanvasUtils";
import { CanvasMarcher, UpdateMarcherPage } from "../../global/Interfaces";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherStore } from "@/stores/marcher/useMarcherStore";
import { usePageStore } from "@/stores/page/usePageStore";
import { useMarcherPageStore } from "@/stores/marcherPage/useMarcherPageStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import { getNextPage } from "../page/PageUtils";

function Canvas() {
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const { marchers, marchersAreLoading } = useMarcherStore()!;
    const { pagesAreLoading, pages } = usePageStore()!;
    const { marcherPages, marcherPagesAreLoading, fetchMarcherPages } = useMarcherPageStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { setSelectedMarchers } = useSelectedMarchers()!;
    const { fieldProperties } = useFieldProperties()!;
    const { uiSettings } = useUiSettingsStore()!;
    const [isLoading, setIsLoading] = React.useState<boolean>(true);
    const [canvasMarchers] = React.useState<CanvasMarcher[]>([]);
    const staticGridRef = useRef<fabric.Rect | any>(null);
    const canvas = useRef<fabric.Canvas | any>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    /* -------------------------- Listener Functions -------------------------- */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleObjectModified = useCallback((e: any) => {
        const activeObjects = canvas.current.getActiveObjects();

        const changes: UpdateMarcherPage[] = [];
        activeObjects.forEach((activeObject: any) => {
            const newCoords = CanvasMarcherUtils.fabricObjectToRealCoords({ canvas: canvas.current, fabricGroup: activeObject as fabric.Group });
            if (activeObject.id_for_html && newCoords?.x && newCoords?.y) {
                const marcherId = idForHtmlToId(activeObject.id_for_html);
                changes.push({ marcher_id: marcherId, page_id: selectedPage!.id, x: newCoords.x, y: newCoords.y });
            } else {
                console.error("Marcher or fabric object not found - handleObjectModified: Canvas.tsx");
            }
        });
        updateMarcherPages(changes).then(() => { fetchMarcherPages() });
    }, [selectedPage, fetchMarcherPages]);

    /**
     * Set the selected marcher when selected element changes
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleSelect = useCallback((e: any) => {
        const newSelectedMarchers = marchers.filter((marcher) => canvas.current.getActiveObjects()
            .some((selected: any) => selected.id_for_html === marcher.id_for_html))
            || []; // If no marchers are selected, set the selected marchers to an empty array
        setSelectedMarchers(newSelectedMarchers);

        // Lock X and Y based on current UiSettings
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
        const evt = opt.e;
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
            const e = opt.e;
            const vpt = canvas.current.viewportTransform;
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        // set objectCaching to true to improve performance while zooming
        if (!staticGridRef.current.objectCaching)
            staticGridRef.current.objectCaching = true;

        // set objectCaching to true to improve performance while zooming
        if (!staticGridRef.current.objectCaching)
            staticGridRef.current.objectCaching = true;

        const delta = opt.e.deltaY;
        let zoom = canvas.current.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 25) zoom = 25;
        if (zoom < 0.35) zoom = 0.35;
        canvas.current.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();

        // set objectCaching to false after 100ms to improve performance after zooming
        // This is what prevents the grid from being blurry after zooming
        clearTimeout(canvas.current.zoomTimeout);
        canvas.current.zoomTimeout = setTimeout(() => {
            if (staticGridRef.current.objectCaching) {
                staticGridRef.current.objectCaching = false;
                canvas.current.renderAll();
            }
        }, 50);

        // set objectCaching to false after 100ms to improve performance after zooming
        // This is what prevents the grid from being blurry after zooming
        clearTimeout(canvas.current.zoomTimeout);
        canvas.current.zoomTimeout = setTimeout(() => {
            if (staticGridRef.current.objectCaching) {
                staticGridRef.current.objectCaching = false;
                canvas.current.renderAll();
            }
        }, 50);
    };

    const initiateListeners = useCallback(() => {
        if (!canvas.current) return;
        canvas.current.on('object:modified', handleObjectModified);
        canvas.current.on('selection:updated', handleSelect);
        canvas.current.on('selection:created', handleSelect);
        canvas.current.on('selection:cleared', handleDeselect);

        canvas.current.on('mouse:down', handleMouseDown);
        canvas.current.on('mouse:move', handleMouseMove);
        canvas.current.on('mouse:up', handleMouseUp);
        canvas.current.on('mouse:wheel', handleMouseWheel);

    }, [handleObjectModified, handleSelect, handleDeselect]);


    const cleanupListeners = useCallback(() => {
        if (!canvas.current) return;
        canvas.current.off('object:modified');
        canvas.current.off('selection:updated');
        canvas.current.off('selection:created');
        canvas.current.off('selection:cleared');

        canvas.current.off('mouse:down');
        canvas.current.off('mouse:move');
        canvas.current.off('mouse:up');
        canvas.current.off('mouse:wheel');

    }, []);

    /* -------------------------- useEffects -------------------------- */
    // Set Loading
    useEffect(() => {
        setIsLoading(marchersAreLoading || pagesAreLoading || marcherPagesAreLoading);
    }, [pagesAreLoading, marcherPagesAreLoading, marchersAreLoading]);

    /* Initialize the canvas.current */
    // Update the objectModified listener when the selected page changes
    useEffect(() => {
        if (!(!canvas.current && selectedPage && canvasRef.current && fieldProperties)) return;
        canvas.current = new fabric.Canvas(canvasRef.current, {});

        canvas.current.perfLimitSizeTotal = 225000000;
        canvas.current.maxCacheSideLimit = 11000;

        // Set canvas.current size
        CanvasUtils.refreshCanvasSize(canvas.current);
        // Update canvas.current size on window resize
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        window.addEventListener('resize', (evt) => {
            CanvasUtils.refreshCanvasSize(canvas.current);
        });

        // Set canvas.current configuration options
        // canvas.current.backgroundColor = getColor('$purple-200');
        canvas.current.selectionColor = "white";
        canvas.current.selectionLineWidth = 8;
        // set initial canvas.current size
        staticGridRef.current = CanvasUtils.buildField(fieldProperties);
        canvas.current.add(staticGridRef.current);
        staticGridRef.current.objectCaching = true;

        // Set canvas selection color
        canvas.current.selectionColor = 'rgba(0, 0, 255, 0.2)';
        canvas.current.selectionBorderColor = 'rgba(0, 0, 255, 1)';
        canvas.current.selectionLineWidth = 2;

        canvas.current.renderAll()
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
            CanvasMarcherUtils.updateMarcherLabels({ marchers, canvasMarchers, canvas: canvas.current });
        }
    }, [marchers, isLoading, canvasMarchers]);

    // Update/render the marchers when the selected page or the marcher pages change
    useEffect(() => {
        if (canvas.current && !isLoading && selectedPage) {
            CanvasMarcherUtils.renderMarchers({ canvas: canvas.current, marchers, selectedPage, canvasMarchers, marcherPages });
        }
    }, [marchers, pages, marcherPages, selectedPage, isLoading, canvasMarchers]);

    // TODO implement this for multiple marchers
    // Change the active object when the selected marcher changes
    // useEffect(() => {
    //     if (!(canvas.current && !isLoading && canvasMarchers.length > 0 && selectedMarchers.length > 0))
    //         return;

    //     const selectedMarcherIds = selectedMarchers.map(marcher => marcher.id);
    //     const activeObjects = canvasMarchers.filter(canvasMarcher => selectedMarcherIds.includes(canvasMarcher.marcher_id));
    //     if (activeObjects.length > 0) {
    //         const fabricObjects = activeObjects.map(activeObject => activeObject.fabricObject);
    //         canvas.current.discardActiveObject();
    //         if (fabricObjects && fabricObjects.length > 0)
    //             canvas.current.setActiveObject(new fabric.ActiveSelection(fabricObjects, {
    //                 canvas: canvas.current,
    //             }));
    //     }
    // }, [selectedMarchers, isLoading, canvasMarchers]);

    useEffect(() => {
        canvas.current.getObjects().forEach((canvasObj: any) => { canvasObj.lockMovementX = uiSettings.lockX; });
    }, [uiSettings, uiSettings.lockY]);

    // Lock Y
    useEffect(() => {
        if (!(canvas.current && uiSettings)) return;
        canvas.current.getObjects().forEach((canvasObj: any) => { canvasObj.lockMovementY = uiSettings.lockY; });
    }, [uiSettings, uiSettings.lockY]);

    /* --------------------------Animation Functions-------------------------- */

    // eslint-disable-next-line
    const startAnimation = useCallback(() => {
        if (!(canvas.current && selectedPage)) return;
        const nextPage = getNextPage(selectedPage!, pages);
        if (!nextPage) return;
        const nextPageMarcherPages = marcherPages.filter((marcherPage) => marcherPage.page_id === nextPage.id);
        const duration = 1000;

        canvasMarchers.forEach((canvasMarcher) => {
            const marcherPageToUse = nextPageMarcherPages.find((marcherPage) => marcherPage.marcher_id === canvasMarcher.marcher_id);
            const nextLeft = marcherPageToUse?.x;
            const nextTop = marcherPageToUse?.y;
            if (!nextLeft || !nextTop) {
                throw new Error("Marcher page not found - startAnimation: Canvas.tsx");
            }
            const newCoords = CanvasMarcherUtils.realCoordsToCanvasCoords({ canvasMarcher, x: nextLeft, y: nextTop });
            if (!newCoords) return;
            canvasMarcher?.fabricObject?.animate({
                left: newCoords.x,
                top: newCoords.y,
            }, {
                duration: duration,
                onChange: canvas.current!.renderAll.bind(canvas.current),
                easing: linearEasing,
            });
            setTimeout(() => {
                setSelectedPage(nextPage);
                setIsPlaying(false);
            }, duration);
        });
    }, [selectedPage, pages, marcherPages, canvasMarchers, setSelectedPage, setIsPlaying]);

    useEffect(() => {
        if (!(canvas.current && !isLoading && isPlaying)) return;
        startAnimation();
    }, [isLoading, isPlaying, startAnimation]);

    return (
        <div className="canvas-container-custom">
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
}

export default Canvas;
