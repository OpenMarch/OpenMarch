import { useRef, useEffect, useState, useCallback } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import {
    marcherPagesByPageQueryOptions,
    updateMarcherPagesMutationOptions,
    updateLightingEffectLayersMutationOptions,
    deleteLightingEffectLayersMutationOptions,
    fieldPropertiesQueryOptions,
    allMarchersQueryOptions,
    marcherWithVisualsQueryOptions,
    lightingKeys,
} from "@/hooks/queries";
import { useIsPlaying } from "@/context/IsPlayingContext";
import OpenMarchCanvas from "../../global/classes/canvasObjects/OpenMarchCanvas";
import DefaultListeners from "./listeners/DefaultListeners";
import EffectLayerListeners from "./listeners/EffectLayerListeners";
import EffectLayerEditListeners from "./listeners/EffectLayerEditListeners";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import LineListeners from "./listeners/LineListeners";
import { useLightDesignerEffectLayerDrawStore } from "@/stores/LightDesignerEffectLayerDrawStore";
import { useLightDesignerSelectedEffectStore } from "@/stores/LightDesignerSelectedEffectStore";
import { useWorkspaceViewStore } from "@/stores/WorkspaceViewStore";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import clsx from "clsx";
import { useAnimation } from "@/hooks/useAnimation";
import CollisionMarker from "@/global/classes/canvasObjects/CollisionMarker";
import { useCollisionStore } from "@/stores/CollisionStore";
import { setCanvasStore } from "@/stores/CanvasStore";
import useEditablePath from "./hooks/editablePath";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTimingObjects } from "@/hooks";
import { useSelectionStore } from "@/stores/SelectionStore";
import { useSelectionListeners } from "./hooks/canvasListeners.selection";
import { useMovementListeners } from "./hooks/canvasListeners.movement";
import { useRenderMarcherShapes } from "./hooks/shapes";
import { useRenderLightingEffectLayers } from "./hooks/useRenderLightingEffectLayers";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { ShapePath } from "@/global/classes/canvasObjects/ShapePath";
import { MarcherAppearance } from "./hooks/marcherAppearance";
import { useHighlightedMarchers } from "./hooks/useHighlightedMarchers";

/**
 * The field/stage UI of OpenMarch
 *
 * @param className Additional classNames to add to the <div/> containing this canvas
 * @param testCanvas An OpenMarchCanvas object to pass in, rather than this component creating its own. Should only be used for test purposes.
 * @param onCanvasReady Callback function that receives the canvas instance once it's initialized.
 * @returns
 */
// eslint-disable-next-line max-lines-per-function
export default function Canvas({
    className = "",
    testCanvas,
    onCanvasReady,
}: {
    className?: string;
    testCanvas?: OpenMarchCanvas;
    onCanvasReady?: (canvas: OpenMarchCanvas) => void;
}) {
    const queryClient = useQueryClient();
    const { isPlaying } = useIsPlaying()!;
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { pages } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;
    const { data: marcherVisuals } = useQuery(marcherWithVisualsQueryOptions());
    const { setSelectedMarchers } = useSelectedMarchers()!;

    // MarcherPage queries
    const { data: marcherPages, isSuccess: marcherPagesLoaded } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );
    const { data: previousMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.previousPageId!),
    );
    const { data: nextMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.nextPageId!),
    );

    const updateMarcherPages = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );
    const updateEffectLayer = useMutation(
        updateLightingEffectLayersMutationOptions(),
    );
    const deleteEffectLayer = useMutation(
        deleteLightingEffectLayersMutationOptions(),
    );
    const selectedEffect =
        useLightDesignerSelectedEffectStore.use.selectedEffect();
    const { setSelectedShapePageIds } = useSelectionStore()!;
    const databaseReady = useDatabaseReady();

    const { data: fieldProperties } = useQuery(
        fieldPropertiesQueryOptions(databaseReady),
    );
    const { uiSettings } = useUiSettingsStore()!;
    const {
        alignmentEvent,
        alignmentEventMarchers,
        setAlignmentEventMarchers,
        setAlignmentEventNewMarcherPages,
        resetAlignmentEvent,
    } = useAlignmentEventStore()!;
    const workspaceMode = useWorkspaceViewStore.use.mode();
    const effectLayerDrawState =
        useLightDesignerEffectLayerDrawStore.use.drawState();
    const isCanvasEditingEnabled = workspaceMode === "editor";
    const { isFullscreen, perspective, setPerspective } = useFullscreenStore();
    const [canvas, setCanvas] = useState<OpenMarchCanvas | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const innerDivRef = useRef<HTMLDivElement>(null);
    const fullscreenEnterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const fullscreenExitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const { currentCollisions } = useCollisionStore();

    // Custom hooks for the canvas
    useEditablePath();
    useSelectionListeners({
        canvas,
        isCanvasEditingEnabled,
        syncFabricSelection:
            workspaceMode === "editor" || workspaceMode === "lightDesigner",
    });
    useMovementListeners({ canvas, isCanvasEditingEnabled });
    useAnimation({ canvas, workspaceMode });
    useRenderMarcherShapes({ canvas, selectedPage, isPlaying });
    useRenderLightingEffectLayers({ canvas, isPlaying });
    useHighlightedMarchers({
        canvas,
        marcherVisuals,
        selectedPageId: selectedPage?.id,
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
        const panY = (containerHeight - fieldHeight * newZoom) / 10;

        // Apply the new viewport transform
        canvas.setViewportTransform([newZoom, 0, 0, newZoom, panX, panY]);

        // Reset any CSS transforms if that function exists
        if (typeof canvas.resetCSSTransform === "function") {
            canvas.resetCSSTransform();
        }

        canvas.requestRenderAll();
    }, [canvas, fieldProperties, isFullscreen]);

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
        setCanvasStore(newCanvasInstance);
        window.canvas = newCanvasInstance;
        if (onCanvasReady) {
            onCanvasReady(newCanvasInstance);
        }

        // Ensure initial center at base zoom once the wrapper has laid out
        requestAnimationFrame(() => {
            newCanvasInstance.centerAtBaseZoom?.();
        });
    }, [
        selectedPage,
        fieldProperties,
        testCanvas,
        uiSettings,
        canvas,
        onCanvasReady,
    ]);

    useEffect(() => {
        if (workspaceMode === "lightDesigner") {
            resetAlignmentEvent();
        }
    }, [workspaceMode, resetAlignmentEvent]);

    // Light Designer: selection + pan/zoom like DefaultListeners, but no persisted marcher moves
    useEffect(() => {
        if (!canvas) return;
        canvas.marcherTransformsReadOnly = workspaceMode === "lightDesigner";
        canvas.refreshActiveMarcherLocks();
    }, [canvas, workspaceMode]);

    // Initiate listeners
    useEffect(() => {
        if (canvas) {
            if (workspaceMode === "lightDesigner") {
                if (effectLayerDrawState.status === "drawing") {
                    canvas.setListeners(new EffectLayerListeners({ canvas }));
                } else {
                    canvas.setListeners(
                        new EffectLayerEditListeners({ canvas }),
                    );
                }
                canvas.eventMarchers = [];
            } else {
                switch (alignmentEvent) {
                    case "line":
                        canvas.setListeners(
                            new LineListeners({ canvas: canvas }),
                        );
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
            }

            centerAndFitCanvas();

            return () => {
                canvas.eventMarchers = [];
            };
        }
    }, [
        canvas,
        workspaceMode,
        effectLayerDrawState,
        alignmentEvent,
        alignmentEventMarchers,
        centerAndFitCanvas,
        isFullscreen,
    ]);

    // Set the updateMarcherPages function on the canvas
    useEffect(() => {
        if (canvas) {
            canvas.updateMarcherPagesFunction = updateMarcherPages.mutate;
        }
    }, [canvas, updateMarcherPages.mutate]);

    useEffect(() => {
        if (!canvas) return;

        canvas.updateLightingEffectLayerFunction = (modified) => {
            const effectId = selectedEffect?.effectId;
            if (effectId == null) return;
            updateEffectLayer.mutate({
                lightingEffectId: effectId,
                modifiedLayers: [modified],
            });
        };

        canvas.deleteLightingEffectLayerFunction = (layerId) => {
            const effectId = selectedEffect?.effectId;
            if (effectId == null) return;
            deleteEffectLayer.mutate({
                lightingEffectId: effectId,
                layerIds: new Set([layerId]),
            });
        };

        canvas.revertLightingEffectLayersFunction = () => {
            const effectId = selectedEffect?.effectId;
            if (effectId == null) return;
            void queryClient.invalidateQueries({
                queryKey: lightingKeys.lightingEffectById(effectId),
            });
        };
    }, [
        canvas,
        queryClient,
        selectedEffect?.effectId,
        updateEffectLayer.mutate,
        deleteEffectLayer.mutate,
    ]);

    // Sync canvas with marcher visuals
    useEffect(() => {
        if (!canvas || !marchers || marcherVisuals == null || !fieldProperties)
            return;

        canvas.renderOnAddRemove = false;
        try {
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
                // TODO: Uncomment when EditablePath is fully implemented
                // Actually don't do this! We need the editable paths in separate queries since they're by page.
                // They can't updated on every page change
                // visualGroup
                //     .getNextPathway()
                //     .getFabricObjects()
                //     .forEach((fabricObject: fabric.Object) => {
                //         canvas.add(fabricObject);
                //     });
                // Using simple pathway method (like previous paths) for now
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
        } finally {
            canvas.renderOnAddRemove = true;
        }
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
        if (
            !canvas ||
            !selectedPage ||
            !marchers ||
            !marcherPagesLoaded ||
            marcherVisuals == null
        )
            return;

        canvas.currentPage = selectedPage;

        canvas
            .renderMarchers({
                marcherVisuals,
                marcherPages,
            })
            .catch((error) => {
                console.error("Error rendering marchers", error);
            });
    }, [
        canvas,
        marcherPages,
        marcherPagesLoaded,
        marcherVisuals,
        marchers,
        selectedPage,
    ]);

    // Renders pathways when selected page or settings change
    useEffect(() => {
        if (
            !canvas ||
            !selectedPage ||
            !fieldProperties ||
            !marcherPagesLoaded ||
            marcherVisuals == null
        )
            return;

        if (marchers) {
            // Always call renderPathVisuals, but it will show/hide based on settings
            canvas.renderPathVisuals({
                marcherVisuals: marcherVisuals,
                currentMarcherPages: marcherPages,
                previousMarcherPages: uiSettings.previousPaths
                    ? previousMarcherPages || {}
                    : {},
                nextMarcherPages: uiSettings.nextPaths
                    ? nextMarcherPages || {}
                    : {},

                marcherIds: marchers.map((m) => m.id),
            });
            canvas.sendCanvasMarchersToFront();
        }
    }, [
        canvas,
        fieldProperties,
        marcherPages,
        previousMarcherPages,
        nextMarcherPages,
        marchers,
        pages,
        selectedPage,
        uiSettings.nextPaths,
        uiSettings.previousPaths,
        marcherVisuals,
        marcherPagesLoaded,
    ]);

    // Update the canvas when the field properties change
    useEffect(() => {
        if (canvas && fieldProperties) {
            // canvas.refreshBackgroundImage();
            canvas.fieldProperties = fieldProperties;
            // Recalculate zoom and position after field properties update
            requestAnimationFrame(() => centerAndFitCanvas());
        }
    }, [canvas, fieldProperties, centerAndFitCanvas, isFullscreen]);

    // Handle fullscreen state changes
    useEffect(() => {
        if (!canvas || !containerRef.current) return;

        // Clear any pending timeouts before scheduling new ones
        if (fullscreenEnterTimeoutRef.current) {
            clearTimeout(fullscreenEnterTimeoutRef.current);
            fullscreenEnterTimeoutRef.current = null;
        }
        if (fullscreenExitTimeoutRef.current) {
            clearTimeout(fullscreenExitTimeoutRef.current);
            fullscreenExitTimeoutRef.current = null;
        }

        // When fullscreen mode is activated, center and fit the canvas
        if (isFullscreen) {
            // Wait for CSS transition and layout to complete before centering
            fullscreenEnterTimeoutRef.current = setTimeout(() => {
                requestAnimationFrame(() => {
                    centerAndFitCanvas();
                    setSelectedMarchers([]);
                    setSelectedShapePageIds([]);
                });
            }, 250);
        }

        if (!isFullscreen) {
            setPerspective(0);
            // Recalculate canvas size and center after exiting fullscreen
            // Wait for CSS transition (200ms) + layout to complete before measuring
            // Use clientWidth/clientHeight for non-transformed layout dimensions
            fullscreenExitTimeoutRef.current = setTimeout(() => {
                requestAnimationFrame(() => {
                    let width = innerDivRef.current?.clientWidth ?? 0;
                    let height = innerDivRef.current?.clientHeight ?? 0;

                    // Fallback to containerRef if innerDivRef has zero dimensions
                    if (width <= 0 || height <= 0) {
                        width = containerRef.current?.clientWidth ?? 0;
                        height = containerRef.current?.clientHeight ?? 0;
                    }

                    // Only set canvas size if we have valid dimensions
                    if (width > 0 && height > 0) {
                        canvas.setCanvasSize(width, height);
                    } else {
                        canvas.refreshCanvasSize();
                    }
                    canvas.centerAtBaseZoom();
                });
            }, 250);
        }

        // Cleanup timeouts on unmount or before re-running effect
        return () => {
            if (fullscreenEnterTimeoutRef.current) {
                clearTimeout(fullscreenEnterTimeoutRef.current);
                fullscreenEnterTimeoutRef.current = null;
            }
            if (fullscreenExitTimeoutRef.current) {
                clearTimeout(fullscreenExitTimeoutRef.current);
                fullscreenExitTimeoutRef.current = null;
            }
        };
    }, [
        isFullscreen,
        canvas,
        centerAndFitCanvas,
        setSelectedMarchers,
        setPerspective,
        setSelectedShapePageIds,
    ]);

    // Set up container resize observer and window resize handler to keep canvas centered in fullscreen mode
    useEffect(() => {
        if (!canvas || !containerRef.current) return;

        // Use ResizeObserver to detect container size changes
        const resizeObserver = new ResizeObserver(() => {
            centerAndFitCanvas();
        });

        resizeObserver.observe(containerRef.current);

        // Also handle window resize events
        const handleResize = () => {
            centerAndFitCanvas();
        };

        window.addEventListener("resize", handleResize);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", handleResize);
        };
    }, [canvas, centerAndFitCanvas, isFullscreen]);

    /* --------------------------Animation Functions-------------------------- */

    // This effect ensures that when the animation is playing, the shape paths
    // are removed from the canvas.
    useEffect(() => {
        if (canvas && isPlaying && selectedPage) {
            canvas.removeAllObjectsByType(ShapePath);
        }
    }, [canvas, isPlaying, selectedPage]);

    // This effect ensures that when the animation is paused, the marchers are
    // rendered at their final positions for the selected page.
    useEffect(() => {
        if (
            canvas &&
            !isPlaying &&
            selectedPage &&
            marcherPagesLoaded &&
            marcherVisuals != null
        ) {
            canvas
                .renderMarchers({
                    marcherPages: marcherPages,
                    marcherVisuals: marcherVisuals,
                })
                .catch((error) => {
                    console.error("Error rendering marchers", error);
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

    // Render collision markers when paused
    useEffect(() => {
        if (!canvas) return;

        // Always remove existing collision markers when page changes or animation starts
        const existingMarkers = canvas
            .getObjects()
            .filter((obj: any) => obj.isCollisionMarker);
        existingMarkers.forEach((marker) => canvas.remove(marker));

        // Add new collision markers only when paused, collisions exist, and showCollisions is enabled
        if (
            !isPlaying &&
            currentCollisions.length > 0 &&
            uiSettings.showCollisions
        ) {
            currentCollisions.forEach((collision) => {
                const collisionCircle = new CollisionMarker(
                    collision.x,
                    collision.y,
                    collision.distance,
                    canvas,
                );
                collisionCircle.addText(collision.label);
                collisionCircle.draw();
            });
        }

        canvas.requestRenderAll();
    }, [
        canvas,
        isPlaying,
        currentCollisions,
        selectedPage,
        uiSettings.showCollisions,
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
            <MarcherAppearance canvas={canvas} />
            {pages.length > 0 || canvas ? (
                <div
                    ref={innerDivRef}
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
                    <canvas
                        ref={canvasRef}
                        id="fieldCanvas"
                        data-testid="fieldCanvas"
                    />
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
