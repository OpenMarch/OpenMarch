import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import {
    marcherPagesByPageQueryOptions,
    updateMarcherPagesMutationOptions,
    updateMarcherPagesAndGeometryMutationOptions,
    fieldPropertiesQueryOptions,
    allMarchersQueryOptions,
    marcherWithVisualsQueryOptions,
    marcherAppearancesQueryOptions,
    allPropsQueryOptions,
    propPageGeometryQueryOptions,
    propImagesQueryOptions,
    updatePropGeometryMutationOptions,
    updatePropGeometryWithPropagationMutationOptions,
} from "@/hooks/queries";
import { useIsPlaying } from "@/context/IsPlayingContext";
import OpenMarchCanvas from "../../global/classes/canvasObjects/OpenMarchCanvas";
import DefaultListeners from "./listeners/DefaultListeners";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import LineListeners from "./listeners/LineListeners";
import PropDrawingListeners, {
    PropGeometry,
} from "./listeners/PropDrawingListeners";
import { usePropDrawingStore } from "@/stores/PropDrawingStore";

import { createPropsMutationOptions } from "@/hooks/queries";
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
import { useRenderProps } from "./hooks/props";
import { usePropClipboard } from "./hooks/propClipboard";
import { ShapePath } from "@/global/classes/canvasObjects/ShapePath";
import CanvasProp from "@/global/classes/canvasObjects/CanvasProp";
import { getPixelsPerFoot } from "@/global/classes/Prop";

import { fabric } from "fabric";
import PropVisualGroup, {
    PropVisualMap,
} from "@/global/classes/PropVisualGroup";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogClose,
    Button,
} from "@openmarch/ui";
import type { GeometryPropagation } from "@/db-functions/prop";

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
    const { data: marcherAppearances } = useQuery(
        marcherAppearancesQueryOptions(selectedPage?.id, queryClient),
    );
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
    const updatePropGeometry = useMutation(
        updatePropGeometryMutationOptions(queryClient),
    );
    const updateMarcherPagesAndGeometry = useMutation(
        updateMarcherPagesAndGeometryMutationOptions(queryClient),
    );
    const updatePropGeometryWithPropagation = useMutation(
        updatePropGeometryWithPropagationMutationOptions(queryClient),
    );
    const [pendingPropGeometry, setPendingPropGeometry] = useState<{
        propId: number;
        pageId: number;
        changes: { width: number; height: number; rotation: number };
    } | null>(null);
    const [propGeometryScope, setPropGeometryScope] =
        useState<GeometryPropagation>("forward");
    const [propRecreateKey, setPropRecreateKey] = useState(0);
    const pagesCountRef = useRef(pages.length);
    pagesCountRef.current = pages.length;
    const { setSelectedShapePageIds } = useSelectionStore()!;

    // Props queries
    const { data: props } = useQuery(allPropsQueryOptions());
    const { data: propGeometries } = useQuery(propPageGeometryQueryOptions());
    const { data: propImages } = useQuery(propImagesQueryOptions());
    const { mutate: createPropsMutate } = useMutation(
        createPropsMutationOptions(queryClient),
    );

    // Create prop visuals map for pathways (use ref to persist across renders)
    const propVisualsRef = useRef<PropVisualMap>({});
    const propVisuals = useMemo(() => {
        if (!props) return propVisualsRef.current;
        const currentIds = new Set(props.map((p) => p.marcher_id));
        // Remove visuals for props that no longer exist
        for (const id of Object.keys(propVisualsRef.current)) {
            if (!currentIds.has(Number(id))) {
                delete propVisualsRef.current[Number(id)];
            }
        }
        // Add visuals for new props
        for (const prop of props) {
            if (!propVisualsRef.current[prop.marcher_id]) {
                propVisualsRef.current[prop.marcher_id] = new PropVisualGroup({
                    marcherId: prop.marcher_id,
                });
            }
        }
        return propVisualsRef.current;
    }, [props]);

    // Prop image cache — persists loaded HTMLImageElement objects across renders.
    // imageCacheVersion is state so that when async loading finishes, the prop
    // rendering effect re-runs and picks up the newly cached elements.
    const propImageCacheRef = useRef<
        Map<number, { el: HTMLImageElement; url: string }>
    >(new Map());
    const [imageCacheVersion, setImageCacheVersion] = useState(0);
    useEffect(() => {
        if (!propImages) return;
        let cancelled = false;

        const revokeAll = (
            cache: Map<number, { el: HTMLImageElement; url: string }>,
        ) => {
            for (const { url } of cache.values()) URL.revokeObjectURL(url);
        };

        if (propImages.length === 0) {
            if (propImageCacheRef.current.size > 0) {
                revokeAll(propImageCacheRef.current);
                propImageCacheRef.current = new Map();
                setImageCacheVersion((v) => v + 1);
            }
            return;
        }
        const loadImg = (
            data: Uint8Array,
        ): Promise<{ el: HTMLImageElement; url: string }> =>
            new Promise((resolve, reject) => {
                const blob = new Blob([(data as any).buffer ?? data]);
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => resolve({ el: img, url });
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error("Image load failed"));
                };
                img.src = url;
            });
        void (async () => {
            const newCache = new Map<
                number,
                { el: HTMLImageElement; url: string }
            >();
            const loaded: string[] = [];
            await Promise.all(
                propImages.map(async ({ prop_id, image }) => {
                    try {
                        const entry = await loadImg(image);
                        loaded.push(entry.url);
                        if (!cancelled) newCache.set(prop_id, entry);
                        else URL.revokeObjectURL(entry.url);
                    } catch {
                        /* skip broken images */
                    }
                }),
            );
            if (!cancelled) {
                revokeAll(propImageCacheRef.current);
                propImageCacheRef.current = newCache;
                setImageCacheVersion((v) => v + 1);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [propImages]);

    // Prop drawing state
    const { drawingMode, resetDrawingState } = usePropDrawingStore();

    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { uiSettings } = useUiSettingsStore()!;
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
    useAnimation({ canvas });
    useRenderMarcherShapes({ canvas, selectedPage, isPlaying });
    useRenderProps({
        canvas,
        selectedPage,
        fieldProperties,
        propImageCacheRef,
        imageCacheVersion,
        propRecreateKey,
        showPropNames: uiSettings.showPropNames,
        propNameOverrides: uiSettings.propNameOverrides,
        hiddenPropIds: uiSettings.hiddenPropIds,
    });
    usePropClipboard({
        canvas,
        canvasRef,
        selectedPageId: selectedPage?.id,
        focussedComponent: uiSettings.focussedComponent,
        createPropsMutate: createPropsMutate,
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

    // Helper to convert pixels to feet
    const pixelsToFeetLocal = useCallback(
        (pixels: number) => {
            if (!fieldProperties) return pixels;
            return pixels / getPixelsPerFoot(fieldProperties);
        },
        [fieldProperties],
    );

    // Handle prop drawing completion
    const handlePropDrawingComplete = useCallback(
        (geometry: PropGeometry) => {
            const widthFeet = pixelsToFeetLocal(geometry.widthPixels);
            const heightFeet = pixelsToFeetLocal(geometry.heightPixels);

            // Build custom geometry JSON for non-rectangle shapes
            let customGeometry: string | undefined;
            if (geometry.points) {
                customGeometry = JSON.stringify({
                    points: geometry.points,
                    originalWidth: geometry.widthPixels,
                    originalHeight: geometry.heightPixels,
                });
            }

            createPropsMutate([
                {
                    name: `New ${geometry.shapeType}`,
                    surface_type: "obstacle",
                    width: Math.max(widthFeet, 1),
                    height: Math.max(heightFeet, 1),
                    shape_type: geometry.shapeType,
                    custom_geometry: customGeometry,
                    initial_x: geometry.centerX,
                    initial_y: geometry.centerY,
                },
            ]);

            resetDrawingState();
        },
        [createPropsMutate, pixelsToFeetLocal, resetDrawingState],
    );

    // Initiate listeners
    useEffect(() => {
        if (canvas) {
            // Check for prop drawing mode first
            if (drawingMode) {
                const propListeners = new PropDrawingListeners({
                    canvas,
                    drawingMode,
                });
                propListeners.onComplete = handlePropDrawingComplete;
                propListeners.onCancel = resetDrawingState;
                canvas.setListeners(propListeners);
            } else {
                // Standard listeners
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
        drawingMode,
        handlePropDrawingComplete,
        resetDrawingState,
    ]);

    // Update canvas functions for database updates
    useEffect(() => {
        if (canvas) {
            canvas.updateMarcherPagesFunction = updateMarcherPages.mutate;
            canvas.updatePropGeometryFunction = updatePropGeometry.mutate;
            canvas.updateMarcherPagesAndGeometryFunction =
                updateMarcherPagesAndGeometry.mutateAsync;
            canvas.onPropGeometryEditedFromCanvas = (args) => {
                if (pagesCountRef.current <= 1) {
                    updatePropGeometryWithPropagation.mutate({
                        propId: args.propId,
                        currentPageId: args.pageId,
                        changes: args.changes,
                        propagation: "forward",
                    });
                    return;
                }
                setPendingPropGeometry(args);
                setPropGeometryScope("forward");
            };
        }
    }, [
        canvas,
        updateMarcherPages.mutate,
        updatePropGeometry.mutate,
        updateMarcherPagesAndGeometry.mutateAsync,
        updatePropGeometryWithPropagation.mutate,
    ]);

    // Sync canvas with marcher visuals
    useEffect(() => {
        if (!canvas || !marchers || marcherVisuals == null || !fieldProperties)
            return;

        canvas.renderOnAddRemove = false;
        try {
            // Remove marcher visuals from canvas (skip CanvasProps - managed separately)
            canvas.getCanvasMarchers().forEach((canvasMarcher) => {
                if (CanvasProp.isCanvasProp(canvasMarcher)) return;
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

    // Sync canvas with marcher appearances
    useEffect(() => {
        if (
            !canvas ||
            !marchers ||
            marcherAppearances == null ||
            marcherVisuals == null
        )
            return;

        // Add all marcher appearances to the canvas
        marchers.forEach((marcher) => {
            const visualGroup = marcherVisuals[marcher.id];
            const appearancesForMarcher = marcherAppearances[marcher.id];
            if (!visualGroup || !appearancesForMarcher) return;

            const canvasMarcher = visualGroup.getCanvasMarcher();
            canvasMarcher.setAppearance(
                appearancesForMarcher,
                {
                    requestRenderAll: false,
                },
                fieldProperties?.theme.defaultMarcher.label,
            );
        });

        canvas.requestRenderAll();
    }, [
        canvas,
        marchers,
        marcherAppearances,
        marcherVisuals,
        fieldProperties?.theme.defaultMarcher.label,
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

    // Add prop pathway visuals to canvas and update their positions
    useEffect(() => {
        if (
            !canvas ||
            !props ||
            !fieldProperties ||
            !selectedPage ||
            !marcherPagesLoaded
        )
            return;

        // Remove existing prop pathway visuals
        for (const visual of Object.values(propVisuals)) {
            canvas.remove(visual.getPreviousPathway());
            canvas.remove(visual.getNextPathway());
            canvas.remove(visual.getPreviousMidpoint());
            canvas.remove(visual.getNextMidpoint());
            canvas.remove(visual.getPreviousEndpoint());
            canvas.remove(visual.getNextEndpoint());
        }

        const prevPageIsEmpty =
            !previousMarcherPages ||
            Object.keys(previousMarcherPages).length === 0;
        const nextPageIsEmpty =
            !nextMarcherPages || Object.keys(nextMarcherPages).length === 0;

        // Add all prop pathway visuals and update positions
        for (const prop of props) {
            const visual = propVisuals[prop.marcher_id];
            if (!visual) continue;

            // Add pathway visuals to canvas
            canvas.add(visual.getPreviousPathway());
            canvas.add(visual.getNextPathway());
            canvas.add(visual.getPreviousMidpoint());
            canvas.add(visual.getNextMidpoint());
            canvas.add(visual.getPreviousEndpoint());
            canvas.add(visual.getNextEndpoint());

            // Apply theme colors
            visual
                .getPreviousPathway()
                .setColor(fieldProperties.theme.previousPath);
            visual.getNextPathway().setColor(fieldProperties.theme.nextPath);
            visual
                .getPreviousMidpoint()
                .setColor(fieldProperties.theme.previousPath);
            visual.getNextMidpoint().setColor(fieldProperties.theme.nextPath);
            visual
                .getPreviousEndpoint()
                .setColor(fieldProperties.theme.previousPath);
            visual.getNextEndpoint().setColor(fieldProperties.theme.nextPath);

            // Update positions
            const prev = !prevPageIsEmpty
                ? previousMarcherPages?.[prop.marcher_id]
                : undefined;
            const curr = marcherPages?.[prop.marcher_id];
            const next = !nextPageIsEmpty
                ? nextMarcherPages?.[prop.marcher_id]
                : undefined;

            // Previous pathway, midpoint, endpoint
            if (uiSettings.previousPaths && !prevPageIsEmpty && prev && curr) {
                visual.getPreviousPathway().show();
                visual.getPreviousPathway().updateStartCoords(curr);
                visual.getPreviousPathway().updateEndCoords(prev);

                visual.getPreviousMidpoint().show();
                visual.getPreviousMidpoint().updateCoords({
                    x: (curr.x + prev.x) / 2,
                    y: (curr.y + prev.y) / 2,
                });

                visual.getPreviousEndpoint().show();
                visual.getPreviousEndpoint().updateCoords(prev);
            } else {
                visual.getPreviousPathway().hide();
                visual.getPreviousMidpoint().hide();
                visual.getPreviousEndpoint().hide();
            }

            // Next pathway, midpoint, endpoint
            if (uiSettings.nextPaths && !nextPageIsEmpty && next && curr) {
                visual.getNextPathway().show();
                visual.getNextPathway().updateStartCoords(curr);
                visual.getNextPathway().updateEndCoords(next);

                visual.getNextMidpoint().show();
                visual.getNextMidpoint().updateCoords({
                    x: (curr.x + next.x) / 2,
                    y: (curr.y + next.y) / 2,
                });

                visual.getNextEndpoint().show();
                visual.getNextEndpoint().updateCoords(next);
            } else {
                visual.getNextPathway().hide();
                visual.getNextMidpoint().hide();
                visual.getNextEndpoint().hide();
            }
        }

        canvas.requestRenderAll();
    }, [
        canvas,
        fieldProperties,
        marcherPages,
        previousMarcherPages,
        nextMarcherPages,
        props,
        propVisuals,
        selectedPage,
        uiSettings.nextPaths,
        uiSettings.previousPaths,
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

    const applyPropGeometryScope = useCallback(
        (scope: GeometryPropagation) => {
            if (!pendingPropGeometry) return;
            updatePropGeometryWithPropagation.mutate(
                {
                    propId: pendingPropGeometry.propId,
                    currentPageId: pendingPropGeometry.pageId,
                    changes: pendingPropGeometry.changes,
                    propagation: scope,
                },
                { onSettled: () => setPendingPropGeometry(null) },
            );
        },
        [pendingPropGeometry, updatePropGeometryWithPropagation.mutate],
    );

    return (
        <>
            <Dialog
                open={!!pendingPropGeometry}
                onOpenChange={(open) => {
                    if (!open) {
                        setPropRecreateKey((k) => k + 1);
                        setPendingPropGeometry(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogTitle>Apply prop changes</DialogTitle>
                    <DialogDescription>
                        Apply this size/rotation to:
                    </DialogDescription>
                    <div className="mt-12 flex flex-col gap-8">
                        <Button
                            size="compact"
                            variant={
                                propGeometryScope === "current"
                                    ? "primary"
                                    : "secondary"
                            }
                            onClick={() => setPropGeometryScope("current")}
                        >
                            This page only
                        </Button>
                        <Button
                            size="compact"
                            variant={
                                propGeometryScope === "forward"
                                    ? "primary"
                                    : "secondary"
                            }
                            onClick={() => setPropGeometryScope("forward")}
                        >
                            This page forward (default)
                        </Button>
                        <Button
                            size="compact"
                            variant={
                                propGeometryScope === "all"
                                    ? "primary"
                                    : "secondary"
                            }
                            onClick={() => setPropGeometryScope("all")}
                        >
                            All pages
                        </Button>
                    </div>
                    <div className="mt-12 flex justify-end gap-8">
                        <DialogClose>
                            <Button
                                variant="secondary"
                                size="compact"
                                onClick={() => {
                                    setPropRecreateKey((k) => k + 1);
                                    setPendingPropGeometry(null);
                                }}
                            >
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            size="compact"
                            onClick={() => {
                                applyPropGeometryScope(propGeometryScope);
                                setPendingPropGeometry(null);
                            }}
                            disabled={
                                updatePropGeometryWithPropagation.isPending
                            }
                        >
                            Apply
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
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
        </>
    );
}
