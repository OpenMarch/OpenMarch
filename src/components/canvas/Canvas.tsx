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
import { useCursorModeStore } from "@/stores/CursorModeStore";
import LineListeners from "./listeners/LineListeners";
import { CanvasColors } from "./CanvasConstants";
import { useMarcherLineStore } from "@/stores/MarcherLineStore";
import MarcherLine from "@/global/classes/canvasObjects/MarcherLine";
import * as Selectable from "@/global/classes/canvasObjects/interfaces/Selectable";
import { useSelectedMarcherLinesStore } from "@/stores/selection/SelectedMarcherLineStore";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";

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
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { fieldProperties } = useFieldProperties()!;
    const { uiSettings } = useUiSettingsStore()!;
    const { cursorMode, cursorModeMarchers } = useCursorModeStore()!;
    const { marcherLines } = useMarcherLineStore()!;
    const { selectedMarcherLines, setSelectedMarcherLines } =
        useSelectedMarcherLinesStore()!;
    const [canvas, setCanvas] = useState<OpenMarchCanvas>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationCallbacks = useRef<any>([]);
    const timeoutID = useRef<any>(null);

    /* -------------------------- Selection Functions -------------------------- */
    const unimplementedError = (
        selectableClass: Selectable.SelectableClasses
    ) => {
        throw new Error(
            `Invalid selectable class "${selectableClass}". Have you implemented all of the cases in Canvas.tsx for each selectable item on the canvas?`
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
            selectedClass: Selectable.SelectableClasses
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
                            ])
                    );
                    for (const selectedMarcher of selectedMarchers) {
                        const canvasMarcher = canvasMarchers.get(
                            selectedMarcher.id
                        );
                        if (!canvasMarcher) {
                            console.error(
                                "SelectedMarcher not found on Canvas",
                                selectedMarcher
                            );
                            continue;
                        }
                        globalSelectedClassIds.add(
                            Selectable.getClassId(canvasMarcher)
                        );
                    }
                    break;
                }
                case Selectable.SelectableClasses.MARCHER_LINE: {
                    for (const selectedMarcherLine of selectedMarcherLines) {
                        globalSelectedClassIds.add(
                            Selectable.getClassId(selectedMarcherLine)
                        );
                    }
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
    }, [canvas, selectedMarcherLines, selectedMarchers]);

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
                Selectable.getClassId(selectableObject)
            )
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
            [Selectable.SelectableClasses.MARCHER_LINE]: [],
        };

        const allObjectsToSelect: Selectable.ISelectable[] = [];
        for (const selectableActiveObject of canvas.getActiveSelectableObjects()) {
            newSelectedObjects[selectableActiveObject.classString].push(
                selectableActiveObject.objectToGloballySelect
            );
            allObjectsToSelect.push(selectableActiveObject);
        }

        canvas.setActiveObjects(allObjectsToSelect);

        const selectObjectsGlobally = (
            selectableClass: Selectable.SelectableClasses
        ) => {
            switch (selectableClass) {
                case Selectable.SelectableClasses.MARCHER: {
                    // Marcher
                    setSelectedMarchers(
                        newSelectedObjects[Selectable.SelectableClasses.MARCHER]
                    );
                    break;
                }
                case Selectable.SelectableClasses.MARCHER_LINE: {
                    // MarcherLine
                    setSelectedMarcherLines(
                        newSelectedObjects[
                            Selectable.SelectableClasses.MARCHER_LINE
                        ]
                    );
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
        setSelectedMarcherLines,
        setSelectedMarchers,
    ]);

    /**
     * Handler for clearing global selected objects in the store
     */
    const handleDeselect = useCallback(() => {
        const deselectObjects = (
            selectableClass: Selectable.SelectableClasses
        ) => {
            switch (selectableClass) {
                case Selectable.SelectableClasses.MARCHER: {
                    setSelectedMarchers([]);
                    break;
                }
                case Selectable.SelectableClasses.MARCHER_LINE: {
                    setSelectedMarcherLines([]);
                    break;
                }
                default: {
                    unimplementedError(selectableClass);
                }
            }
        };

        for (const selectableClass of Object.values(
            Selectable.SelectableClasses
        )) {
            deselectObjects(selectableClass);
        }
    }, [setSelectedMarcherLines, setSelectedMarchers]);

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
                ])
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
                })
            );
        }
    }, [selectedPage, fieldProperties, testCanvas, uiSettings, canvas]);

    // Initiate listeners
    useEffect(() => {
        if (canvas) {
            canvas.clearListeners();
            // Initiate listeners
            switch (cursorMode) {
                case "line":
                    canvas.setListeners(new LineListeners({ canvas: canvas }));
                    break;
                default:
                    canvas.setListeners(
                        new DefaultListeners({ canvas: canvas })
                    );
                    break;
            }
            canvas.eventMarchers = canvas.getCanvasMarchersByIds(
                cursorModeMarchers.map((marcher) => marcher.id)
            );

            // Cleanup
            return () => {
                canvas.clearListeners();
                canvas.eventMarchers = [];
            };
        }
    }, [canvas, cursorMode, cursorModeMarchers]);

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
                    selectedPage.id
                ),
                allMarchers: marchers,
            });
        }
    }, [canvas, marcherPages, marchers, selectedPage]);

    // Renders pathways when selected page or settings change
    useEffect(() => {
        if (canvas && selectedPage) {
            const prevPage = selectedPage.getPreviousPage(pages);
            const nextPage = selectedPage.getNextPage(pages);

            canvas.removePathways();
            canvas.removeStaticCanvasMarchers();

            // Only find the marcher pages if the settings are enabled. This is to prevent unnecessary calculations
            let selectedPageMarcherPages: MarcherPage[] = [];
            if (uiSettings.previousPaths || uiSettings.nextPaths)
                selectedPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    selectedPage.id
                );

            if (uiSettings.previousPaths && prevPage) {
                const prevPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    prevPage.id
                );

                canvas.renderStaticMarchers({
                    intendedMarcherPages: prevPageMarcherPages,
                    color: CanvasColors.previousPage,
                    allMarchers: marchers,
                });
                canvas.renderPathways({
                    startPageMarcherPages: prevPageMarcherPages,
                    endPageMarcherPages: selectedPageMarcherPages,
                    color: CanvasColors.previousPage,
                });
            }
            if (uiSettings.nextPaths && nextPage) {
                const nextPageMarcherPages = MarcherPage.filterByPageId(
                    marcherPages,
                    nextPage.id
                );

                canvas.renderStaticMarchers({
                    intendedMarcherPages: nextPageMarcherPages,
                    color: CanvasColors.nextPage,
                    allMarchers: marchers,
                });
                canvas.renderPathways({
                    startPageMarcherPages: selectedPageMarcherPages,
                    endPageMarcherPages: nextPageMarcherPages,
                    color: CanvasColors.nextPage,
                });
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

    // Render the marcher lines when the selected page or marcher lines change
    useEffect(() => {
        if (!canvas || !selectedPage) return;

        const currentPageMarcherLines = MarcherLine.getMarcherLinesForPage({
            marcherLines,
            page: selectedPage,
            allPages: pages,
        });
        canvas.renderMarcherLines({ marcherLines: currentPageMarcherLines });
    }, [canvas, marcherLines, pages, selectedPage]);

    /* --------------------------Animation Functions-------------------------- */

    useEffect(() => {
        if (canvas && selectedPage) {
            if (isPlaying) {
                const nextPage = selectedPage.getNextPage(pages);
                if (!nextPage) return;

                const nextPageMarcherPages = marcherPages.filter(
                    (marcherPage) => marcherPage.page_id === nextPage.id
                );
                canvas.getCanvasMarchers().forEach((canvasMarcher) => {
                    const marcherPageToUse = nextPageMarcherPages.find(
                        (marcherPage) =>
                            marcherPage.marcher_id ===
                                canvasMarcher.marcherObj.id &&
                            marcherPage.page_id === nextPage.id
                    );
                    if (!marcherPageToUse) {
                        console.error(
                            "Marcher page not found - startAnimation: Canvas.tsx",
                            canvasMarcher
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
                        selectedPage.id
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
        <div className={`overflow-hidden ${className}`}>
            {marchers.length > 0 && pages.length > 0 ? (
                <canvas ref={canvasRef} id="fieldCanvas" />
            ) : (
                // If there are no marchers or pages, display a message
                <div className="flex bg-gray-900 text-white h-full w-full align-middle flex-col justify-center text-center">
                    <h3>To start the show, create Marchers and Pages</h3>
                    <p>Then {"`Window -> Refresh` (or `Ctrl+R`)"}</p>
                    <h5>
                        If anything in OpenMarch ever seems broken, a refresh
                        will often fix it.
                    </h5>
                </div>
            )}
        </div>
    );
}
