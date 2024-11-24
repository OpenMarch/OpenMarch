import { useRef, useEffect, useState, useCallback } from "react";
import { useUiSettingsStore } from "../../stores/UiSettingsStore";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useSelectedMarchers } from "../../context/SelectedMarchersContext";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherStore } from "@/stores/MarcherStore";
import { usePageStore } from "@/stores/PageStore";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import { useIsPlaying } from "@/context/IsPlayingContext";
import MarcherPage from "@/global/classes/MarcherPage";
import OpenMarchCanvas from "../../global/classes/canvasObjects/OpenMarchCanvas";
import DefaultListeners from "./listeners/DefaultListeners";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import LineListeners from "./listeners/LineListeners";
import { CanvasColors } from "./CanvasConstants";
import * as Selectable from "@/global/classes/canvasObjects/interfaces/Selectable";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { useShapePageStore } from "@/stores/ShapePageStore";
import Marcher from "@/global/classes/Marcher";

/**
 * The field/stage UI of OpenMarch
 *
 * @param className Additional classNames to add to the <div/> containing this canvas
 * @param testCanvas An OpenMarchCanvas object to pass in, rather than this component creating its own. Should only be used for test purposes.
 * @returns
 */
export default function Canvas({
    className = "",
    testCanvas,
}: {
    className?: string;
    testCanvas?: OpenMarchCanvas;
}) {
    const { isPlaying, setIsPlaying } = useIsPlaying()!;
    const { marchers } = useMarcherStore()!;
    const { pages } = usePageStore()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { shapePages, selectedShapePages, setSelectedShapePages } =
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
    const [canvas, setCanvas] = useState<OpenMarchCanvas>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationCallbacks = useRef<any>([]);
    const timeoutID = useRef<any>(null);
    const pagePathways = useRef<fabric.Object[]>([]);

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

                    // Check if any shapePage has this marcher in it
                    const currentSelectedShapePageIds = new Set(
                        selectedShapePages.map((sp) => sp.id),
                    );
                    const marcherShapesToSelect = [];
                    for (const marcherShape of canvas.marcherShapes) {
                        if (
                            currentSelectedShapePageIds.has(
                                marcherShape.shapePage.id,
                            ) ||
                            marcherShape.canvasMarchers.find((cm) =>
                                marcherIds.has(cm.marcherObj.id),
                            ) !== undefined
                        ) {
                            marcherShapesToSelect.push(marcherShape);
                        }
                    }

                    setSelectedShapePages(
                        marcherShapesToSelect.map((ms) => ms.shapePage),
                    );

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
        selectedShapePages,
        setSelectedMarchers,
        setSelectedShapePages,
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

    useEffect(() => {
        if (!canvas) return;
        canvas.on("selection:created", handleSelect);
        canvas.on("selection:updated", handleSelect);
        canvas.on("selection:cleared", handleDeselect);

        return () => {
            canvas.off("selection:created", handleSelect);
            canvas.off("selection:updated", handleSelect);
            canvas.off("selection:cleared", handleDeselect);
        };
    }, [canvas, handleDeselect, handleSelect]);

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
        if (canvas || !selectedPage || !fieldProperties) return; // If the canvas is already initialized, or the selected page is not set, return

        if (testCanvas) {
            setCanvas(testCanvas);
        } else {
            setCanvas(
                new OpenMarchCanvas({
                    canvasRef: canvasRef.current,
                    fieldProperties,
                    uiSettings,
                    currentPage: selectedPage,
                }),
            );
        }
    }, [selectedPage, fieldProperties, testCanvas, uiSettings, canvas]);

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

            // Cleanup
            return () => {
                canvas.eventMarchers = [];
            };
        }
    }, [canvas, alignmentEvent, alignmentEventMarchers]);

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
        if (canvas && selectedPage) {
            for (const pathway of pagePathways.current) {
                canvas.remove(pathway);
            }
            pagePathways.current = [];
            canvas.removeStaticCanvasMarchers();

            // Only find the marcher pages if the settings are enabled. This is to prevent unnecessary calculations
            let selectedPageMarcherPages: MarcherPage[] = [];
            if (uiSettings.previousPaths || uiSettings.nextPaths)
                selectedPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.id,
                );

            if (uiSettings.previousPaths && selectedPage.previousPageId) {
                const prevPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.previousPageId,
                );

                canvas.renderStaticMarchers({
                    intendedMarcherPages: prevPageMarcherPages,
                    color: CanvasColors.PREVIOUS_PAGE,
                    allMarchers: marchers,
                });
                const renderedPathways = canvas.renderPathways({
                    startPageMarcherPages: prevPageMarcherPages,
                    endPageMarcherPages: selectedPageMarcherPages,
                    color: CanvasColors.PREVIOUS_PAGE,
                });
                pagePathways.current.push(...renderedPathways);
            }
            if (uiSettings.nextPaths && selectedPage.nextPageId) {
                const nextPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.nextPageId,
                );

                canvas.renderStaticMarchers({
                    intendedMarcherPages: nextPageMarcherPages,
                    color: CanvasColors.NEXT_PAGE,
                    allMarchers: marchers,
                });
                const renderedPathways = canvas.renderPathways({
                    startPageMarcherPages: selectedPageMarcherPages,
                    endPageMarcherPages: nextPageMarcherPages,
                    color: CanvasColors.NEXT_PAGE,
                });
                pagePathways.current.push(...renderedPathways);
            }

            canvas.sendCanvasMarchersToFront();
        }
    }, [
        canvas,
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
    }, [canvas, selectedPage, setSelectedShapePages, shapePages]);

    // Update the control points on MarcherShapes when the selectedShapePages change
    useEffect(() => {
        if (canvas && selectedShapePages) {
            console.log("Selected shape pages changed", selectedShapePages);
            for (const selectedShapePage of selectedShapePages) {
                const shapePageOnCanvas = canvas.marcherShapes.find(
                    (ms) => ms.shapePage.id === selectedShapePage.id,
                );
                if (!shapePageOnCanvas)
                    console.warn("Selected shape page was not found on canvas");
                else shapePageOnCanvas.enableControl();
            }
            // Disable control of all of the non-selected shape pages
            const selectedShapePageIds = new Set(
                selectedShapePages.map((sp) => sp.id),
            );
            for (const marcherShape of canvas.marcherShapes) {
                if (!selectedShapePageIds.has(marcherShape.shapePage.id)) {
                    marcherShape.disableControl();
                }
            }
        }
    }, [canvas, selectedShapePages]);

    // Update the canvas when the field properties change
    useEffect(() => {
        if (canvas && fieldProperties) {
            canvas.fieldProperties = fieldProperties;
        }
    }, [canvas, fieldProperties]);

    /* --------------------------Animation Functions-------------------------- */

    useEffect(() => {
        if (canvas && selectedPage && selectedPage.nextPageId) {
            if (isPlaying) {
                const nextPageId = selectedPage.nextPageId;
                if (nextPageId === null) return;
                const nextPage = selectedPage.getNextPage(pages);
                if (nextPage === null) return;

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
                    const isLastPage = nextPage.getNextPage(pages) === null;
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
        <div className={`h-full overflow-hidden rounded-6 ${className}`}>
            {pages.length > 0 ? (
                <canvas ref={canvasRef} id="fieldCanvas" />
            ) : (
                // If there are no marchers or pages, display a message
                <div className="flex h-full w-full flex-col justify-center gap-8 text-center align-middle text-text">
                    <h4 className="text-h4">
                        To start the show, create Marchers and Pages
                    </h4>
                    <p>Then refresh the window. (Ctrl/Cmd+R)</p>
                    <p>
                        If anything in OpenMarch ever seems broken, a refresh
                        will often fix it.
                    </p>
                </div>
            )}
        </div>
    );
}
