import { useRef, useEffect, useState, useCallback } from "react";
import { useUiSettingsStore } from "../../stores/UiSettingsStore";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherStore } from "@/stores/MarcherStore";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import MarcherPage from "@/global/classes/MarcherPage";
import OpenMarchCanvas from "../../global/classes/canvasObjects/OpenMarchCanvas";
import DefaultListeners from "./listeners/DefaultListeners";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import LineListeners from "./listeners/LineListeners";
import * as Selectable from "@/global/classes/canvasObjects/interfaces/Selectable";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { useShapePageStore } from "@/stores/ShapePageStore";
import Marcher from "@/global/classes/Marcher";
import { Pathway } from "@/global/classes/canvasObjects/Pathway";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { rgbaToString } from "@/global/classes/FieldTheme";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import clsx from "clsx";

/**
 * The field/stage UI of OpenMarch
 *
 * @param className Additional classNames to add to the <div/> containing this canvas
 * @param testCanvas An OpenMarchCanvas object to pass in, rather than this component creating its own. Should only be used for test purposes.
 * @param onCanvasReady Callback function that receives the canvas instance once it's initialized.
 * @returns
 */
export default function Canvas({
    className = "",
    testCanvas,
    onCanvasReady,
}: {
    className?: string;
    testCanvas?: OpenMarchCanvas;
    onCanvasReady?: (canvas: OpenMarchCanvas) => void;
}) {
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const { marchers } = useMarcherStore()!;
    const { pages } = useTimingObjectsStore()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { shapePages, selectedMarcherShapes, setSelectedMarcherShapes } =
        useShapePageStore()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { fieldProperties } = useFieldProperties()!;
    const { uiSettings } = useUiSettingsStore()!;
    const {
        alignmentEvent,
        alignmentEventMarchers,
        setAlignmentEventMarchers,
        setAlignmentEventNewMarcherPages,
    } = useAlignmentEventStore()!;

    const { isFullscreen, perspective, setPerspective } = useFullscreenStore();
    const [canvas, setCanvas] = useState<OpenMarchCanvas>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationCallbacks = useRef<any>([]);
    const timeoutID = useRef<any>(null);
    const pagePathways = useRef<fabric.Object[]>([]);

    // Function to center and fit the canvas to the container
    const centerAndFitCanvas = useCallback(() => {
        if (
            !canvas ||
            !fieldProperties ||
            !containerRef.current ||
            !isFullscreen
        )
            return;

        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;

        if (containerWidth <= 0 || containerHeight <= 0) return;

        const fieldWidth = fieldProperties.width;
        const fieldHeight = fieldProperties.height;

        if (fieldWidth <= 0 || fieldHeight <= 0) return;

        // Calculate the zoom factor to fit the field in the container
        // Apply a small margin (0.95) to ensure the field doesn't touch the edges
        const horizontalZoom = (containerWidth / fieldWidth) * 0.87;
        const verticalZoom = (containerHeight / fieldHeight) * 0.87;

        // Use the smaller zoom factor to ensure the entire field fits
        const newZoom = Math.min(horizontalZoom, verticalZoom);

        // Calculate translation to center the field within the container
        const panX = (containerWidth - fieldWidth * newZoom) / 2;
        const panY = (containerHeight - fieldHeight * newZoom) / 2;

        // Apply the new viewport transform
        canvas.setViewportTransform([newZoom, 0, 0, newZoom, panX, panY]);

        // Reset any CSS transforms if that function exists
        if (typeof canvas.resetCSSTransform === "function") {
            canvas.resetCSSTransform();
        }

        canvas.requestRenderAll();
    }, [canvas, fieldProperties, isFullscreen]);

    /* -------------------------- Selection Functions -------------------------- */
    const unimplementedError = (
        selectableClass: Selectable.SelectableClasses,
    ) => {
        throw new Error(
            `Invalid selectable class "${selectableClass}". Have you implemented all of the cases in Canvas.tsx for each selectable item on the canvas?`,
        );
    };

    /**
     * Gets the classIds of all the global selected objects on the canvas defined in the classes "Selectable.SelectableClasses"
     *
     * NOTE - every time you add a new SelectableClass, it's handler for classIds must be added in the switch statement
     */
    const getGLobalSelectedObjectClassIds = useCallback(() => {
        if (!canvas) return;

        const globalSelectedClassIds: Set<string> = new Set<string>();

        // Get all the classIds of the possible selectable classes
        const addClassIdsToSet = (
            selectedClass: Selectable.SelectableClasses,
        ) => {
            switch (selectedClass) {
                case Selectable.SelectableClasses.MARCHER: {
                    // a bit of a hack because marchers and canvasMarchers are different
                    const canvasMarchers: Map<number, CanvasMarcher> = new Map(
                        canvas
                            .getCanvasMarchers()
                            .map((canvasMarcher) => [
                                canvasMarcher.marcherObj.id,
                                canvasMarcher,
                            ]),
                    );
                    for (const selectedMarcher of selectedMarchers) {
                        const canvasMarcher = canvasMarchers.get(
                            selectedMarcher.id,
                        );
                        if (!canvasMarcher) {
                            console.error(
                                "SelectedMarcher not found on Canvas",
                                selectedMarcher,
                            );
                            continue;
                        }
                        globalSelectedClassIds.add(
                            Selectable.getClassId(canvasMarcher),
                        );
                    }
                    break;
                }
                case Selectable.SelectableClasses.MARCHER_SHAPE: {
                    // setSelectedCurvePoints(newSelectedObjects[Selectable.SelectableClasses.MARCHER_SHAPE]);
                    break;
                }
                default: {
                    unimplementedError(selectedClass);
                }
            }
        };

        // Loop through all enum values to ensure that every selectable class is checked
        for (const value of Object.values(Selectable.SelectableClasses)) {
            addClassIdsToSet(value as Selectable.SelectableClasses);
        }

        return globalSelectedClassIds;
    }, [canvas, selectedMarchers]);

    /**
     * Checks if the selectable active objects on the canvas are the same as the globally selected objects in the
     * classes Selectable.SelectableClasses
     */
    const activeObjectsAreGloballySelected = useCallback(() => {
        if (!canvas) return false;
        const selectableObjects: Selectable.ISelectable[] = [];
        for (const activeObject of canvas.getActiveObjects()) {
            if (Selectable.isSelectable(activeObject))
                selectableObjects.push(activeObject);
        }

        const activeObjectClassIds: Set<string> = new Set<string>(
            selectableObjects.map((selectableObject) =>
                Selectable.getClassId(selectableObject),
            ),
        );

        const globalSelectedClassIds = getGLobalSelectedObjectClassIds();
        if (!globalSelectedClassIds) return false;

        // Check if both sets are equal
        let activeObjectsAreGloballySelected =
            activeObjectClassIds.size === globalSelectedClassIds.size;
        if (activeObjectsAreGloballySelected) {
            for (const classId of activeObjectClassIds) {
                if (!globalSelectedClassIds.has(classId)) {
                    activeObjectsAreGloballySelected = false;
                    break;
                }
            }
        }
        return activeObjectsAreGloballySelected;
    }, [canvas, getGLobalSelectedObjectClassIds]);

    /**
     * Handler for updating what is selected in global state on the canvas.
     *
     * Rather than using a fabric event, this just sets all of the selectable active objects on the canvas to the
     * corresponding global selected objects
     */
    const handleSelect = useCallback(() => {
        if (!canvas || activeObjectsAreGloballySelected()) return;
        const newSelectedObjects: {
            [key in Selectable.SelectableClasses]: any[];
        } = {
            [Selectable.SelectableClasses.MARCHER]: [],
            [Selectable.SelectableClasses.MARCHER_SHAPE]: [],
        };

        const allObjectsToSelect: Selectable.ISelectable[] = [];
        for (const selectableActiveObject of canvas.getActiveSelectableObjects()) {
            newSelectedObjects[selectableActiveObject.classString].push(
                selectableActiveObject.objectToGloballySelect,
            );
            allObjectsToSelect.push(selectableActiveObject);
        }

        canvas.setActiveObjects(allObjectsToSelect);

        const selectObjectsGlobally = (
            selectableClass: Selectable.SelectableClasses,
        ) => {
            switch (selectableClass) {
                case Selectable.SelectableClasses.MARCHER: {
                    // Marcher
                    const marchersToSelect: Marcher[] = newSelectedObjects[
                        Selectable.SelectableClasses.MARCHER
                    ] as any as Marcher[];
                    setSelectedMarchers(marchersToSelect);
                    const marcherIds = new Set(
                        marchersToSelect.map((m) => m.id),
                    );

                    // Only modify the selected shape if marchers were selected
                    if (marchersToSelect.length > 0) {
                        const marcherShapesToSelect = [];
                        for (const marcherShape of canvas.marcherShapes) {
                            if (
                                marcherShape.canvasMarchers.find((cm) =>
                                    marcherIds.has(cm.marcherObj.id),
                                ) !== undefined
                            ) {
                                marcherShapesToSelect.push(marcherShape);
                            }
                        }
                        setSelectedMarcherShapes(marcherShapesToSelect);
                    }

                    break;
                }
                case Selectable.SelectableClasses.MARCHER_SHAPE: {
                    // CurvePoint
                    // setSelectedCurvePoints(newSelectedObjects[Selectable.SelectableClasses.MARCHER_SHAPE]);
                    break;
                }
                default: {
                    unimplementedError(selectableClass);
                }
            }
        };

        // Loop through all enum values to ensure that every selectable class is checked
        for (const value of Object.values(Selectable.SelectableClasses)) {
            selectObjectsGlobally(value as Selectable.SelectableClasses);
        }
    }, [
        activeObjectsAreGloballySelected,
        canvas,
        setSelectedMarcherShapes,
        setSelectedMarchers,
    ]);

    /**
     * Handler for clearing global selected objects in the store
     */
    const handleDeselect = useCallback(() => {
        const deselectObjects = (
            selectableClass: Selectable.SelectableClasses,
        ) => {
            switch (selectableClass) {
                case Selectable.SelectableClasses.MARCHER: {
                    setSelectedMarchers([]);
                    break;
                }
                case Selectable.SelectableClasses.MARCHER_SHAPE: {
                    // setSelectedCurvePoints([]);
                    break;
                }
                default: {
                    unimplementedError(selectableClass);
                }
            }
        };

        for (const selectableClass of Object.values(
            Selectable.SelectableClasses,
        )) {
            deselectObjects(selectableClass);
        }
    }, [setSelectedMarchers]);

    /**
     * Handler for moving CanvasMarchers to update paths.
     */
    const handleObjectMoving = useCallback(() => {
        if (!canvas || !selectedPage || !marcherPages) return;

        // Get selected CanvasMarchers and their IDs
        const selectedCanvasMarchers = canvas.getCanvasMarchers({
            active: true,
        });
        const selectedIds = selectedCanvasMarchers.map(
            (cm: any) => cm.marcherObj.id,
        );

        // Find previous/next MarcherPages for selected marchers
        const prevPages = marcherPages.filter(
            (mp) =>
                selectedIds.includes(mp.marcher_id) &&
                mp.page_id === selectedPage.previousPageId,
        );
        const nextPages = marcherPages.filter(
            (mp) =>
                selectedIds.includes(mp.marcher_id) &&
                mp.page_id === selectedPage.nextPageId,
        );

        // Remove pathways for selected marchers
        for (const pathway of pagePathways.current) {
            if (selectedIds.includes(pathway.marcherId)) {
                canvas.remove(pathway);
            }
        }
        pagePathways.current = pagePathways.current.filter(
            (pathway) => !selectedIds.includes(pathway.marcherId),
        );

        // Draw previous/next pathways
        selectedCanvasMarchers.forEach((cm: any) => {
            const marcherId = cm.marcherObj.id;
            const current = { x: cm.left, y: cm.top };

            // Previous pathway
            const prev = prevPages.find(
                (mp: any) => mp.marcher_id === marcherId,
            );
            if (prev && uiSettings.previousPaths) {
                const pathway = new Pathway({
                    start: { x: prev.x, y: prev.y },
                    end: current,
                    color: rgbaToString(fieldProperties!.theme.previousPath),
                    marcherId,
                });
                canvas.add(pathway);
                pagePathways.current.push(pathway);
            }

            // Next pathway
            const next = nextPages.find(
                (mp: any) => mp.marcher_id === marcherId,
            );
            if (next && uiSettings.nextPaths) {
                const pathway = new Pathway({
                    start: current,
                    end: { x: next.x, y: next.y },
                    color: rgbaToString(fieldProperties!.theme.nextPath),
                    marcherId,
                });
                canvas.add(pathway);
                pagePathways.current.push(pathway);
            }
        });

        canvas.requestRenderAll();
    }, [canvas, marcherPages, selectedPage, uiSettings, pagePathways]);

    useEffect(() => {
        if (!canvas) return;
        canvas.on("selection:created", handleSelect);
        canvas.on("selection:updated", handleSelect);
        canvas.on("selection:cleared", handleDeselect);
        canvas.on("object:moving", handleObjectMoving);

        return () => {
            canvas.off("selection:created", handleSelect);
            canvas.off("selection:updated", handleSelect);
            canvas.off("selection:cleared", handleDeselect);
            canvas.off("object:moving", handleObjectMoving);
        };
    }, [canvas, handleDeselect, handleSelect, handleObjectMoving]);

    // Set the canvas' active object to the global selected object when they change outside of user-canvas-interaction
    useEffect(() => {
        if (!canvas || activeObjectsAreGloballySelected()) return;
        const selectableObjects: Map<string, Selectable.ISelectable> = new Map(
            canvas
                .getAllSelectableObjects()
                .map((selectableObject) => [
                    Selectable.getClassId(selectableObject),
                    selectableObject,
                ]),
        );

        const globalSelectedClassIds = getGLobalSelectedObjectClassIds();
        if (!globalSelectedClassIds) return;

        const objectsToSelect: Selectable.ISelectable[] = [];
        for (const classId of globalSelectedClassIds) {
            const selectableObject = selectableObjects.get(classId);
            if (selectableObject) objectsToSelect.push(selectableObject);
            else
                console.error("Selectable object not found on canvas", classId);
        }

        canvas.setActiveObjects(objectsToSelect);
    }, [
        marchers,
        selectedMarchers,
        marcherPages,
        selectedPage,
        canvas,
        setSelectedMarchers,
        getGLobalSelectedObjectClassIds,
        activeObjectsAreGloballySelected,
    ]);

    /* -------------------------- useEffects -------------------------- */
    /* Initialize the canvas */
    useEffect(() => {
        if (canvas || !selectedPage || !fieldProperties) {
            window.canvas = canvas;
            return;
        } // If the canvas is already initialized, or the selected page is not set, return

        let newCanvasInstance: OpenMarchCanvas;
        if (testCanvas) {
            newCanvasInstance = testCanvas;
        } else {
            newCanvasInstance = new OpenMarchCanvas({
                canvasRef: canvasRef.current,
                fieldProperties,
                uiSettings,
                currentPage: selectedPage,
            });
        }

        setCanvas(newCanvasInstance);
        window.canvas = canvas;
        if (onCanvasReady) {
            onCanvasReady(newCanvasInstance);
        }
    }, [
        selectedPage,
        fieldProperties,
        testCanvas,
        uiSettings,
        canvas,
        onCanvasReady,
    ]);

    // Initiate listeners
    useEffect(() => {
        if (canvas) {
            // Initiate listeners
            switch (alignmentEvent) {
                case "line":
                    canvas.setListeners(new LineListeners({ canvas: canvas }));
                    break;
                default:
                    canvas.setListeners(
                        new DefaultListeners({ canvas: canvas }),
                    );
                    break;
            }
            canvas.eventMarchers = canvas.getCanvasMarchersByIds(
                alignmentEventMarchers.map((marcher) => marcher.id),
            );

            // Center and fit canvas when it's first initialized if in fullscreen mode
            if (isFullscreen) {
                centerAndFitCanvas();
            }

            // Cleanup
            return () => {
                canvas.eventMarchers = [];
            };
        }
    }, [
        canvas,
        alignmentEvent,
        alignmentEventMarchers,
        centerAndFitCanvas,
        isFullscreen,
    ]);

    // Setters for alignmentEvent state
    useEffect(() => {
        if (canvas) {
            canvas.setGlobalEventMarchers = setAlignmentEventMarchers;
            canvas.setGlobalNewMarcherPages = setAlignmentEventNewMarcherPages;
        }
    }, [canvas, setAlignmentEventMarchers, setAlignmentEventNewMarcherPages]);

    // Set the canvas UI settings to the global UI settings
    useEffect(() => {
        if (canvas) canvas.setUiSettings(uiSettings);
    }, [canvas, uiSettings]);

    // Update/render the marchers when the selected page or the marcher pages change
    useEffect(() => {
        if (canvas && selectedPage && marchers && marcherPages) {
            canvas.currentPage = selectedPage;
            canvas.renderMarchers({
                currentMarcherPages: MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.id,
                ),
                allMarchers: marchers,
            });
        }
    }, [canvas, marcherPages, marchers, selectedPage]);

    // Renders pathways when selected page or settings change
    useEffect(() => {
        if (canvas && selectedPage && fieldProperties) {
            for (const pathway of pagePathways.current) {
                canvas.remove(pathway);
            }
            pagePathways.current = [];
            canvas.removeStaticCanvasMarchers();

            // Only find the marcher pages if the settings are enabled. This is to prevent unnecessary calculations
            let selectedPageMarcherPages: MarcherPage[] = [];
            if (uiSettings.previousPaths || uiSettings.nextPaths) {
                selectedPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.id,
                );
            }

            if (
                uiSettings.previousPaths &&
                selectedPage.previousPageId !== null
            ) {
                const prevPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.previousPageId,
                );

                canvas.renderStaticMarchers({
                    intendedMarcherPages: prevPageMarcherPages,
                    color: rgbaToString(fieldProperties.theme.previousPath),
                    allMarchers: marchers,
                });
                const [renderedPathways, renderedMidpoints] =
                    canvas.renderPathways({
                        startPageMarcherPages: prevPageMarcherPages,
                        endPageMarcherPages: selectedPageMarcherPages,
                        color: rgbaToString(fieldProperties.theme.previousPath),
                    });
                pagePathways.current.push(
                    ...renderedPathways,
                    ...renderedMidpoints,
                );
            }
            if (uiSettings.nextPaths && selectedPage.nextPageId !== null) {
                const nextPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.nextPageId,
                );

                canvas.renderStaticMarchers({
                    intendedMarcherPages: nextPageMarcherPages,
                    color: rgbaToString(fieldProperties.theme.nextPath),
                    allMarchers: marchers,
                });
                const [renderedPathways, renderedMidpoints] =
                    canvas.renderPathways({
                        startPageMarcherPages: selectedPageMarcherPages,
                        endPageMarcherPages: nextPageMarcherPages,
                        color: rgbaToString(fieldProperties.theme.nextPath),
                    });
                pagePathways.current.push(
                    ...renderedPathways,
                    ...renderedMidpoints,
                );
            }

            canvas.sendCanvasMarchersToFront();
        }
    }, [
        canvas,
        fieldProperties,
        marcherPages,
        marchers,
        pages,
        selectedPage,
        uiSettings.nextPaths,
        uiSettings.previousPaths,
    ]);

    // Update/render the MarcherShapes when the selected page or the ShapePages change
    useEffect(() => {
        if (canvas && selectedPage && shapePages) {
            canvas.currentPage = selectedPage;
            const currentShapePages = shapePages.filter(
                (sp) => sp.page_id === selectedPage.id,
            );
            canvas.renderMarcherShapes({
                shapePages: currentShapePages,
            });
        }
    }, [canvas, selectedPage, shapePages]);

    // // Refresh the selectedMarcherShapes when the ShapePages change
    // useEffect(() => {
    //     if (
    //         canvas &&
    //         selectedPage &&
    //         shapePages &&
    //         selectedMarcherShapes &&
    //         selectedMarcherShapes.length > 0
    //     ) {
    //         const selectedMarcherShapeIds = new Set(
    //             selectedMarcherShapes.map((ms) => ms.shapePage.id),
    //         );
    //         const selectedMarcherShapeMap = new Map<number, MarcherShape>(
    //             selectedMarcherShapes.map((ms) => [ms.shapePage.id, ms]),
    //         );
    //         const canvasMarcherShapeMap = new Map<number, MarcherShape>(
    //             canvas.marcherShapes.map((ms) => [ms.shapePage.id, ms]),
    //         );

    //         let newMarcherShapesAreDifferent = false;
    //         const marcherShapesToSelect = [];
    //         for (const shapePageIdToSelect of selectedMarcherShapeIds) {
    //             const canvasMarcherShape =
    //                 canvasMarcherShapeMap.get(shapePageIdToSelect);

    //             if (canvasMarcherShape) {
    //                 marcherShapesToSelect.push(canvasMarcherShape);

    //                 const oldMarcherShape =
    //                     selectedMarcherShapeMap.get(shapePageIdToSelect);
    //                 if (!oldMarcherShape) {
    //                     console.warn(
    //                         `Could not find marcher shape for shape page id ${shapePageIdToSelect}`,
    //                     );
    //                     continue;
    //                 }

    //                 if (!newMarcherShapesAreDifferent)
    //                     newMarcherShapesAreDifferent =
    //                         !canvasMarcherShape.equals(oldMarcherShape);

    //                 console.log(
    //                     "marcherShapes are different",
    //                     newMarcherShapesAreDifferent,
    //                     oldMarcherShape.shapePath.toString(),
    //                     canvasMarcherShape.shapePath.toString(),
    //                 );
    //             }
    //         }

    //         if (
    //             newMarcherShapesAreDifferent &&
    //             marcherShapesToSelect.length > 0
    //         )
    //             setSelectedMarcherShapes(marcherShapesToSelect);
    //     }
    // }, [
    //     canvas,
    //     selectedMarcherShapes,
    //     selectedPage,
    //     setSelectedMarcherShapes,
    //     shapePages,
    // ]);

    // Update the control points on MarcherShapes when the selectedShapePages change
    useEffect(() => {
        if (canvas && selectedMarcherShapes) {
            // Disable control of all of the non-selected shape pages and enable control of selected ones
            const selectedMarcherShapeSpIds = new Set(
                selectedMarcherShapes.map((ms) => ms.shapePage.id),
            );
            for (const marcherShape of canvas.marcherShapes) {
                if (selectedMarcherShapeSpIds.has(marcherShape.shapePage.id))
                    marcherShape.enableControl();
                else {
                    marcherShape.disableControl();
                }
            }
        }
    }, [canvas, selectedMarcherShapes]);

    // Update the canvas when the field properties change
    useEffect(() => {
        if (canvas && fieldProperties) {
            // canvas.refreshBackgroundImage();
            canvas.fieldProperties = fieldProperties;
            // Recalculate zoom and position after field properties update if in fullscreen mode
            if (isFullscreen) {
                setTimeout(() => centerAndFitCanvas(), 100);
            }
        }
    }, [canvas, fieldProperties, centerAndFitCanvas, isFullscreen]);

    // Handle fullscreen state changes
    useEffect(() => {
        if (!canvas || !containerRef.current) return;

        // When fullscreen mode is activated, center and fit the canvas
        if (isFullscreen) {
            // Small delay to ensure the fullscreen transition has completed
            setTimeout(() => centerAndFitCanvas(), 100);
            setTimeout(() => setSelectedMarchers([]), 100);
            setTimeout(() => setSelectedMarcherShapes([]), 100);
        }

        if (!isFullscreen) {
            setPerspective(0);
        }
    }, [
        isFullscreen,
        canvas,
        centerAndFitCanvas,
        setSelectedMarchers,
        setSelectedMarcherShapes,
        setPerspective,
    ]);

    // Set up container resize observer and window resize handler to keep canvas centered in fullscreen mode
    useEffect(() => {
        if (!canvas || !containerRef.current) return;

        // Use ResizeObserver to detect container size changes
        const resizeObserver = new ResizeObserver(() => {
            if (isFullscreen) {
                centerAndFitCanvas();
            }
        });

        resizeObserver.observe(containerRef.current);

        // Also handle window resize events
        const handleResize = () => {
            if (isFullscreen) {
                centerAndFitCanvas();
            }
        };

        window.addEventListener("resize", handleResize);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", handleResize);
        };
    }, [canvas, centerAndFitCanvas, isFullscreen]);

    /* --------------------------Animation Functions-------------------------- */

    useEffect(() => {
        if (canvas && selectedPage && selectedPage.nextPageId) {
            if (isPlaying) {
                const nextPageId = selectedPage.nextPageId;
                if (nextPageId === null) return;
                const nextPage = pages.find((page) => page.id === nextPageId);
                if (!nextPage) return;

                const nextPageMarcherPages = marcherPages.filter(
                    (marcherPage) => marcherPage.page_id === nextPageId,
                );
                canvas.getCanvasMarchers().forEach((canvasMarcher) => {
                    const marcherPageToUse = nextPageMarcherPages.find(
                        (marcherPage) =>
                            marcherPage.marcher_id ===
                                canvasMarcher.marcherObj.id &&
                            marcherPage.page_id === nextPageId,
                    );
                    if (!marcherPageToUse) {
                        console.error(
                            "Marcher page not found - startAnimation: Canvas.tsx",
                            canvasMarcher,
                        );
                        return;
                    }

                    const callback = canvasMarcher.setNextAnimation({
                        marcherPage: marcherPageToUse,
                        durationMilliseconds: nextPage.duration * 1000,
                    });
                    animationCallbacks.current.push(callback);
                });

                canvas.requestRenderAll();
                // Set the selected page after the animation is done and set isPlaying to false
                timeoutID.current = setTimeout(() => {
                    const isLastPage = nextPage.nextPageId === null;
                    setSelectedPage(nextPage);
                    if (isLastPage) setIsPlaying(false);
                }, nextPage.duration * 1000);
            } else {
                animationCallbacks.current.forEach((callback: any) => {
                    // Not sure why these are two functions in Fabric.js
                    (callback[0] as () => void)(); // Stop X animation
                    (callback[1] as () => void)(); // Stop Y animation
                });
                if (timeoutID.current) {
                    clearTimeout(timeoutID.current);
                }

                canvas.renderMarchers({
                    currentMarcherPages: MarcherPage.filterByPageId(
                        marcherPages,
                        selectedPage.id,
                    ),
                    allMarchers: marchers,
                });
            }
        }
    }, [
        canvas,
        isPlaying,
        marcherPages,
        marchers,
        pages,
        selectedPage,
        setIsPlaying,
        setSelectedPage,
    ]);

    return (
        <div
            ref={containerRef}
            className={clsx(
                `rounded-6 relative h-full w-full overflow-hidden`,
                {
                    "pointer-events-none pt-128": isFullscreen,
                },
            )}
            style={{
                perspective: `${1500}px`,
                perspectiveOrigin: "center center",
                transformStyle: "preserve-3d",
            }}
        >
            {pages.length > 0 ? (
                <div
                    className="h-full w-full"
                    style={{
                        transform: `rotateX(${perspective}deg)`,
                        transformOrigin:
                            "center 70%" /* Position pivot point below center for more natural look */,
                        transition: "transform 0.2s ease-out",
                        height: "100%",
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <canvas ref={canvasRef} id="fieldCanvas" />
                </div>
            ) : (
                <div className="flex h-full w-full items-center justify-center">
                    <CircleNotchIcon
                        size={32}
                        className="text-text animate-spin"
                    />
                </div>
            )}
        </div>
    );
}
