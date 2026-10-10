import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useShallow } from "zustand/react/shallow";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import {
    marcherPagesByPageQueryOptions,
    updateMarcherPagesMutationOptions,
    moveMarchersInTargetMutationOptions,
    fieldPropertiesQueryOptions,
    allMarchersQueryOptions,
    marcherWithVisualsQueryOptions,
    marcherAppearancesQueryOptions,
} from "@/hooks/queries";
import { useIsPlaying } from "@/context/IsPlayingContext";
import OpenMarchCanvas from "../../global/classes/canvasObjects/OpenMarchCanvas";
import DefaultListeners from "./listeners/DefaultListeners";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import LineListeners from "./listeners/LineListeners";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import clsx from "clsx";
import { useAnimation } from "@/hooks/useAnimation";
import {
    useTimelineAppearance,
    useTimelinePausedAppearance,
} from "@/hooks/useTimelineAppearance";
import CollisionMarker from "@/global/classes/canvasObjects/CollisionMarker";
import { useCollisionStore } from "@/stores/CollisionStore";
import { setCanvasStore } from "@/stores/CanvasStore";
import useEditablePath from "./hooks/editablePath";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTimingObjects } from "@/hooks";
import { useSelectionStore } from "@/stores/SelectionStore";
import { useSelectionListeners } from "./hooks/canvasListeners.selection";
import { useMovementListeners } from "./hooks/canvasListeners.movement";
import { useCanvasUiSettings } from "./hooks/useCanvasUiSettings";
import { usePageAppearances } from "./hooks/usePageAppearances";
import { useRenderMarcherShapes } from "./hooks/shapes";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { ShapePath } from "@/global/classes/canvasObjects/ShapePath";
import { useTimelineMode } from "@/hooks/queries/useWorkspaceSettings";
import { useTimelineStaticRender } from "@/timeline/useTimelineStaticRender";
import { useTimelinePathRender } from "@/timeline/useTimelinePathRender";
import { useTimelineShapeCanvas } from "@/timeline/useTimelineShapeCanvas";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { useTimelineSelectionStore } from "@/stores/TimelineSelectionStore";
import { useTimelineDimming } from "@/timeline/useTimelineDimming";
import TimelineIsolationBar, {
    TimelineFromStartBadge,
} from "@/components/timeline/TimelineIsolationBar";
import { useTimelineFocusRender } from "@/timeline/useTimelineFocusRender";
import TimelineKeptMarks from "./TimelineKeptMarks";
import { db } from "@/global/database/db";
import { canvasCoordinateWriter } from "@/timeline/timelineCoordinateWrites";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";

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
    useEditablePath();
    const { isPlaying } = useIsPlaying()!;
    const { data: marchers } = useQuery(allMarchersQueryOptions());
    const { pages } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;
    const { data: marcherVisuals } = useQuery(
        marcherWithVisualsQueryOptions(queryClient),
    );
    const timelineMode = useTimelineMode();
    // Page mode: the selected page's appearance. Timeline mode reads none (no selected page drives
    // appearance); it styles marchers by beat instead (useTimelineAppearance below)
    const { data: marcherAppearances } = useQuery(
        marcherAppearancesQueryOptions(
            timelineMode ? null : selectedPage?.id,
            queryClient,
        ),
    );
    const { setSelectedMarchers } = useSelectedMarchers()!;

    // Draw from the resolver only once it's ready. Until the first cold build finishes (or if it
    // fails), keep drawing from marcher_pages instead of leaving every marcher at (0, 0).
    const timelineResolverReady = useTimelineResolverStore(
        (s) => s.status === "ready",
    );
    const drawFromResolver = timelineMode && timelineResolverReady;

    // MarcherPage queries. The previous and next pages' rows only feed page mode's paths, which
    // timeline mode draws from the resolver, so they aren't read there. The selected page's rows
    // still gate the page-mode renders below (and other observers read them).
    const { data: marcherPages, isSuccess: marcherPagesLoaded } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );
    const { data: previousMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(
            drawFromResolver ? null : selectedPage?.previousPageId,
        ),
    );
    const { data: nextMarcherPages } = useQuery(
        marcherPagesByPageQueryOptions(
            drawFromResolver ? null : selectedPage?.nextPageId,
        ),
    );

    const updateMarcherPages = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );
    const { mutate: moveMarchersMutate } = useMutation(
        moveMarchersInTargetMutationOptions(),
    );
    const { setSelectedShapePageIds } = useSelectionStore()!;
    const databaseReady = useDatabaseReady();
    const marcherIds = useMemo(() => marchers?.map((m) => m.id), [marchers]);

    const { data: fieldProperties } = useQuery(
        fieldPropertiesQueryOptions(databaseReady),
    );
    // Only the fields this component renders from; the canvas itself is kept in sync with the
    // whole settings object by a store subscription below, so timeline zoom saves and other
    // unrelated settings don't re-render the field
    const uiSettings = useUiSettingsStore(
        useShallow((s) => ({
            previousPaths: s.uiSettings.previousPaths,
            nextPaths: s.uiSettings.nextPaths,
            stepSizeWarnings: s.uiSettings.stepSizeWarnings,
            showCollisions: s.uiSettings.showCollisions,
        })),
    );
    const {
        alignmentEvent,
        alignmentEventMarchers,
        setAlignmentEventMarchers,
        setAlignmentEventNewMarcherPages,
    } = useAlignmentEventStore()!;
    const { isFullscreen, perspective, setPerspective } = useFullscreenStore();
    const [canvas, setCanvas] = useState<OpenMarchCanvas | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const innerDivRef = useRef<HTMLDivElement>(null);
    const fullscreenEnterTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const fullscreenExitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const { currentCollisions } = useCollisionStore();

    // Custom hooks for the canvas
    useSelectionListeners({ canvas });
    useMovementListeners({ canvas });
    // Timeline mode (UI-9): appearance of the last flag crossed, at the live beat while playing
    // (from useAnimation's frame) and at the displayed beat when paused (below)
    const applyTimelineAppearanceAt = useTimelineAppearance({
        canvas,
        enabled: timelineMode,
        redrawKey: marcherVisuals,
    });
    useAnimation({ canvas, onTimelineBeat: applyTimelineAppearanceAt });
    // Page mode draws the selected page's page-era shapes; timeline mode draws none (P7.11)
    useRenderMarcherShapes({ canvas, selectedPage, isPlaying, timelineMode });

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
                uiSettings: useUiSettingsStore.getState().uiSettings,
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
    }, [selectedPage, fieldProperties, testCanvas, canvas, onCanvasReady]);

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

            // Center and fit canvas when it's first initialized
            centerAndFitCanvas();

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
        if (canvas) {
            // Timeline mode (UI-9 Editing, P8.15): a drag sets the dragged marchers' endings in
            // the selected timeline, or their homes at home. The selection is read when the drag
            // ends. A refused move shows why and snaps the marchers back to the resolver.
            canvas.updateMarcherPagesFunction = canvasCoordinateWriter({
                timelineMode,
                writePages: updateMarcherPages.mutate,
                writeTimeline: (request) =>
                    moveMarchersMutate(request, {
                        onError: () => canvas.refreshMarchers(),
                    }),
                onRefused: (error) => {
                    toastTimelineError(error);
                    canvas.refreshMarchers();
                },
            });
        }
    }, [canvas, updateMarcherPages.mutate, moveMarchersMutate, timelineMode]);

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
            // Timeline mode's curved paths belong to the old visual groups (P7.10); the timeline
            // path render adds the new groups' paths back
            canvas.removeTimelinePathways();

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

    // Sync canvas with marcher appearances
    usePageAppearances({
        canvas,
        marchers,
        marcherVisuals,
        marcherAppearances,
        labelColor: fieldProperties?.theme.defaultMarcher.label,
        timelineMode,
    });

    // Timeline mode: in place of the selected page's appearance above
    useTimelinePausedAppearance({
        canvas,
        isPlaying,
        applyAt: applyTimelineAppearanceAt,
    });

    // Setters for alignmentEvent state
    useEffect(() => {
        if (canvas) {
            canvas.setGlobalEventMarchers = setAlignmentEventMarchers;
            canvas.setGlobalNewMarcherPages = setAlignmentEventNewMarcherPages;
        }
    }, [canvas, setAlignmentEventMarchers, setAlignmentEventNewMarcherPages]);

    // Set the canvas UI settings to the global UI settings
    useCanvasUiSettings(canvas);

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
        // Timeline mode draws from the resolver (useTimelineStaticRender below) once it's ready
        if (drawFromResolver) return;

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
        drawFromResolver,
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

        // Timeline mode draws the paths from the resolver (useTimelinePathRender below) once it's
        // ready (P7.10)
        if (drawFromResolver) return;

        if (marchers) {
            // Always call renderPathVisuals, it decides visibility per pathway
            const nextPage = pages.find(
                (p) => p.id === selectedPage.nextPageId,
            );
            canvas.renderPathVisuals({
                marcherVisuals: marcherVisuals,
                currentMarcherPages: marcherPages,
                previousMarcherPages: previousMarcherPages || {},
                nextMarcherPages: nextMarcherPages || {},
                marcherIds: marchers.map((m) => m.id),
                currentPageCounts: selectedPage.counts,
                nextPageCounts: nextPage?.counts,
                previousPathsEnabled: uiSettings.previousPaths,
                nextPathsEnabled: uiSettings.nextPaths,
                stepSizeWarningsEnabled: uiSettings.stepSizeWarnings,
                fieldProperties: fieldProperties,
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
        uiSettings.stepSizeWarnings,
        marcherVisuals,
        marcherPagesLoaded,
        drawFromResolver,
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

    // UI-11: while a paused preview holds a frame, the field shows that frame, not P, where edits
    // land. The first press on the field only returns it to P, so nothing is dragged from the held
    // positions.
    useEffect(() => {
        const container = containerRef.current;
        if (!timelineMode || !container) return;
        let swallowing = false;
        const onPress = (event: Event) => {
            const store = useTimelineSelectionStore.getState();
            if (event.type === "pointerdown") {
                // Only presses on the field itself: overlays (badges, bars) and the popovers
                // that listen for outside presses keep theirs
                swallowing =
                    event.target instanceof HTMLCanvasElement &&
                    store.cursorBeat !== null &&
                    store.playback === null;
                if (swallowing) store.clearCursor();
            }
            if (!swallowing) return;
            event.stopPropagation();
            event.preventDefault();
            // Fabric 5 listens for the mouse events, which follow the pointer events
            if (event.type === "mouseup") swallowing = false;
        };
        const types = ["pointerdown", "mousedown", "pointerup", "mouseup"];
        for (const type of types)
            container.addEventListener(type, onPress, true);
        return () => {
            for (const type of types)
                container.removeEventListener(type, onPress, true);
        };
    }, [timelineMode]);

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
            !drawFromResolver &&
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
        drawFromResolver,
    ]);

    // Timeline mode (P5.5): the static render reads the resolver at the selected page's end beat
    // instead of marcher_pages. Runs after the marcher visuals are synced above.
    useTimelineStaticRender({
        canvas,
        selectedPage,
        // UI-9, UI-11: the paused canvas shows positions at the playhead, or at the frame a
        // paused preview holds. The hook follows it itself, so a scrub doesn't re-render the field
        followPlayhead: true,
        isPlaying,
        enabled: timelineMode,
        redrawKey: marcherVisuals,
    });

    // Timeline mode (UI-9): marchers outside the selected timeline are dimmed and can't be hit
    useTimelineDimming({
        canvas,
        enabled: timelineMode,
        redrawKey: marcherVisuals,
    });

    // Timeline mode (P7.11): the spec shape picked in the inspector, with handles to drag
    useTimelineShapeCanvas({
        canvas,
        enabled: drawFromResolver,
        isPlaying,
        theme: fieldProperties?.theme,
    });

    // Isolation (docs/timeline/research/ownership/09-isolation.md): the isolated move's own paths and ghosts
    // replace the page-pair paths below
    const isolating = useTimelineSelectionStore((s) => s.isolation !== null);
    useTimelineFocusRender({
        canvas,
        database: db,
        enabled: drawFromResolver,
        theme: fieldProperties?.theme,
    });

    // Timeline mode (P7.10): paths, midpoints, endpoints and step-size warnings from the resolver
    // between page end beats, in place of the marcher_pages paths above
    useTimelinePathRender({
        canvas,
        enabled: drawFromResolver,
        isPlaying,
        selectedPage,
        pages,
        marcherIds,
        marcherVisuals,
        fieldProperties,
        previousPathsEnabled: uiSettings.previousPaths && !isolating,
        nextPathsEnabled: uiSettings.nextPaths && !isolating,
        stepSizeWarningsEnabled: uiSettings.stepSizeWarnings && !isolating,
    });

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
            {timelineMode && <TimelineIsolationBar />}
            {timelineMode && <TimelineFromStartBadge />}
            {drawFromResolver && (
                // UI-18: a broken chain beside each marcher kept on the current page
                <TimelineKeptMarks
                    canvas={canvas}
                    isPlaying={isPlaying}
                    pages={pages}
                    pageId={selectedPage?.id}
                    marcherIds={marcherIds}
                />
            )}
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
