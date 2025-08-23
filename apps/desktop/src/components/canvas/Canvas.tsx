import { useRef, useEffect, useState, useCallback } from "react";
import { fabric } from "fabric";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useFieldProperties } from "@/hooks/queries";
import { useIsPlaying } from "@/context/IsPlayingContext";
import OpenMarchCanvas from "../../global/classes/canvasObjects/OpenMarchCanvas";
import DefaultListeners from "./listeners/DefaultListeners";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import LineListeners from "./listeners/LineListeners";
import * as Selectable from "@/global/classes/canvasObjects/interfaces/Selectable";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import { useShapePageStore } from "@/stores/ShapePageStore";
import Marcher from "@/global/classes/Marcher";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { handleGroupRotating } from "@/global/classes/canvasObjects/GroupUtils";
import clsx from "clsx";
import { useMarchersWithVisuals } from "@/global/classes/MarcherVisualGroup";
import { useSectionAppearanceStore } from "@/stores/SectionAppearanceStore";
import { useAnimation } from "@/hooks/useAnimation";
import { useMarcherPages, useUpdateMarcherPages } from "@/hooks/queries";
import CollisionMarker from "@/global/classes/canvasObjects/CollisionMarker";

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
    const { isPlaying } = useIsPlaying()!;
    const { marchers, marcherVisuals, updateMarcherVisuals } =
        useMarchersWithVisuals();
    const { pages } = useTimingObjectsStore()!;
    const { data: marcherPages, isSuccess: marcherPagesLoaded } =
        useMarcherPages({ pages });
    const updateMarcherPages = useUpdateMarcherPages();
    const { shapePages, selectedMarcherShapes, setSelectedMarcherShapes } =
        useShapePageStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const { data: fieldProperties } = useFieldProperties();
    const { uiSettings } = useUiSettingsStore()!;
    const {
        alignmentEvent,
        alignmentEventMarchers,
        setAlignmentEventMarchers,
        setAlignmentEventNewMarcherPages,
    } = useAlignmentEventStore()!;
    const { sectionAppearances, fetchSectionAppearances } =
        useSectionAppearanceStore();
    const { isFullscreen, perspective, setPerspective } = useFullscreenStore();
    const [canvas, setCanvas] = useState<OpenMarchCanvas | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);

    const { currentCollisions } = useAnimation({
        canvas,
    });

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
    const getGlobalSelectedObjectClassIds = useCallback(() => {
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

        const globalSelectedClassIds = getGlobalSelectedObjectClassIds();
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
    }, [canvas, getGlobalSelectedObjectClassIds]);

    /**
     * Handler for updating what is selected in global state on the canvas.
     *
     * Rather than using a fabric event, this just sets all of the selectable active objects on the canvas to the
     * corresponding global selected objects
     */
    const handleSelect = useCallback(() => {
        if (!canvas || activeObjectsAreGloballySelected()) return;
        const newSelectedObjects: {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    const handleRotate = useCallback(
        (fabricEvent: fabric.IEvent<Event>) => {
            if (!canvas || !selectedPage || !marcherPages) return;

            // Snap rotate boxes to 15 degree increments
            handleGroupRotating(
                fabricEvent,
                fabricEvent.target as fabric.Group,
            );

            canvas.requestRenderAll();
        },
        [canvas, selectedPage, marcherPages],
    );

    /**
     * Update paths of moving CanvasMarchers.
     * Uses animation frames to ensure smooth updates.
     */
    const updateMovingPaths = useCallback(() => {
        if (frameRef.current !== null) {
            cancelAnimationFrame(frameRef.current);
        }

        frameRef.current = requestAnimationFrame(() => {
            if (!canvas || !selectedPage || !marcherPages) return;

            canvas.renderPathVisuals({
                marcherVisuals: marcherVisuals,
                marcherPages: marcherPages,
                prevPageId: uiSettings.previousPaths
                    ? selectedPage.previousPageId
                    : null,
                currPageId: selectedPage.id,
                nextPageId: uiSettings.nextPaths
                    ? selectedPage.nextPageId
                    : null,
                marcherIds: selectedMarchers.map((m) => m.id),
                fromCanvasMarchers: true,
            });

            frameRef.current = null;
        });
    }, [
        canvas,
        marcherPages,
        marcherVisuals,
        selectedMarchers,
        selectedPage,
        uiSettings.nextPaths,
        uiSettings.previousPaths,
    ]);

    useEffect(() => {
        if (!canvas) return;
        canvas.on("selection:created", handleSelect);
        canvas.on("selection:updated", handleSelect);
        canvas.on("selection:cleared", handleDeselect);

        canvas.on("object:rotating", handleRotate);

        canvas.on("object:moving", updateMovingPaths);
        canvas.on("object:scaling", updateMovingPaths);
        canvas.on("object:rotating", updateMovingPaths);

        return () => {
            canvas.off("selection:created", handleSelect);
            canvas.off("selection:updated", handleSelect);
            canvas.off("selection:cleared", handleDeselect);

            canvas.off("object:rotating", handleRotate);

            canvas.off("object:moving", updateMovingPaths);
            canvas.off("object:scaling", updateMovingPaths);
            canvas.off("object:rotating", updateMovingPaths);

            if (frameRef.current !== null) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [canvas, handleDeselect, handleRotate, handleSelect, updateMovingPaths]);

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

        const globalSelectedClassIds = getGlobalSelectedObjectClassIds();
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
        getGlobalSelectedObjectClassIds,
        activeObjectsAreGloballySelected,
    ]);

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

    // Update section appearances
    useEffect(() => {
        fetchSectionAppearances();
    }, [fetchSectionAppearances]);

    // Update section appearances
    useEffect(() => {
        if (canvas) {
            canvas.updateMarcherPagesFunction = updateMarcherPages.mutate;
        }
    }, [canvas, updateMarcherPages]);

    // Sync marcher visuals with marchers and section appearances
    useEffect(() => {
        if (marchers && sectionAppearances) {
            updateMarcherVisuals(marchers, sectionAppearances);
        }
    }, [marchers, sectionAppearances, updateMarcherVisuals]);

    // Sync canvas with marcher visuals
    useEffect(() => {
        if (!canvas || !marchers || !marcherVisuals || !fieldProperties) return;

        // Remove all marcher visuals from the canvas
        canvas.getCanvasMarchers().forEach((canvasMarcher) => {
            canvas.remove(canvasMarcher);
            canvas.remove(canvasMarcher.textLabel);
        });
        canvas.getPathways().forEach((pathway) => {
            canvas.remove(pathway);
        });
        canvas.getMidpoints().forEach((midpoint) => {
            canvas.remove(midpoint);
        });
        canvas.getEndpoints().forEach((endpoint) => {
            canvas.remove(endpoint);
        });

        // Add all marcher visuals to the canvas
        marchers.forEach((marcher) => {
            const visualGroup = marcherVisuals[marcher.id];
            if (!visualGroup) return;

            canvas.add(visualGroup.getCanvasMarcher());
            canvas.add(visualGroup.getCanvasMarcher().textLabel);

            canvas.add(visualGroup.getPreviousPathway());
            canvas.add(visualGroup.getNextPathway());
            visualGroup
                .getPreviousPathway()
                .setColor(fieldProperties.theme.previousPath);
            visualGroup
                .getNextPathway()
                .setColor(fieldProperties.theme.nextPath);

            canvas.add(visualGroup.getPreviousMidpoint());
            canvas.add(visualGroup.getNextMidpoint());
            visualGroup
                .getPreviousMidpoint()
                .setColor(fieldProperties.theme.previousPath);
            visualGroup
                .getNextMidpoint()
                .setColor(fieldProperties.theme.nextPath);

            canvas.add(visualGroup.getPreviousEndpoint());
            canvas.add(visualGroup.getNextEndpoint());
            visualGroup
                .getPreviousEndpoint()
                .setColor(fieldProperties.theme.previousPath);
            visualGroup
                .getNextEndpoint()
                .setColor(fieldProperties.theme.nextPath);
        });

        // Request render all to ensure the canvas is updated
        canvas.requestRenderAll();
    }, [canvas, marchers, marcherVisuals, fieldProperties]);

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

    // Render the marchers when the selected page or the marcher pages change
    useEffect(() => {
        if (!canvas || !selectedPage || !marchers || !marcherPages) return;

        canvas.currentPage = selectedPage;

        canvas.renderMarchers({
            marcherVisuals: marcherVisuals,
            marcherPages: marcherPages,
            pageId: selectedPage.id,
        });
    }, [canvas, marcherPages, marcherVisuals, marchers, selectedPage]);

    // Renders pathways when selected page or settings change
    useEffect(() => {
        if (!canvas || !selectedPage || !fieldProperties || !marcherPagesLoaded)
            return;

        if (uiSettings.nextPaths || uiSettings.previousPaths) {
            canvas.renderPathVisuals({
                marcherVisuals: marcherVisuals,
                marcherPages: marcherPages,
                prevPageId: uiSettings.previousPaths
                    ? selectedPage.previousPageId
                    : null,
                currPageId: selectedPage.id,
                nextPageId: uiSettings.nextPaths
                    ? selectedPage.nextPageId
                    : null,
                marcherIds: marchers.map((m) => m.id),
            });
            canvas.sendCanvasMarchersToFront();
        } else {
            canvas.hideAllPathVisuals({ marcherVisuals: marcherVisuals });
            canvas.requestRenderAll();
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
        marcherVisuals,
        marcherPagesLoaded,
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
            setTimeout(() => {
                centerAndFitCanvas();
                setSelectedMarchers([]);
                setSelectedMarcherShapes([]);
            }, 100);
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

    // This effect ensures that when the animation is paused, the marchers are
    // rendered at their final positions for the selected page.
    useEffect(() => {
        if (canvas && !isPlaying && selectedPage && marcherPagesLoaded) {
            canvas.renderMarchers({
                marcherPages: marcherPages,
                pageId: selectedPage.id,
                marcherVisuals: marcherVisuals,
            });
        }
    }, [
        canvas,
        isPlaying,
        selectedPage,
        marcherPages,
        marchers,
        marcherVisuals,
        marcherPagesLoaded,
    ]);

    // Clean up collision markers when page changes or when playing starts
    useEffect(() => {
        if (!canvas) return;

        // Always remove existing collision markers when page changes or animation starts
        const existingMarkers = canvas
            .getObjects()
            .filter((obj: any) => obj.isCollisionMarker);
        existingMarkers.forEach((marker) => canvas.remove(marker));

        // Request render to update the canvas
        canvas.requestRenderAll();
    }, [canvas, selectedPage, isPlaying]);

    // Render collision markers when paused
    useEffect(() => {
        if (!canvas || isPlaying) return;

        // Add new collision markers only when paused and there are collisions
        if (currentCollisions.length > 0) {
            currentCollisions.forEach((collision) => {
                const collisionCircle = new CollisionMarker(
                    collision.x,
                    collision.y,
                    collision.distance,
                    canvas,
                );
                collisionCircle.addText(
                    `${collision.marcher1Id}-${collision.marcher2Id}`,
                );
                collisionCircle.draw();
            });
            canvas.requestRenderAll();
        }
    }, [canvas, isPlaying, currentCollisions, selectedPage]);

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
