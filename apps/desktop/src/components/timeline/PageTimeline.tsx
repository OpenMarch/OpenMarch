import { useIsPlaying } from "@/context/IsPlayingContext";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { DotsThreeIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { useTimingObjects } from "@/hooks";
import Page, { updatePageCountRequest } from "@/global/classes/Page";
import clsx from "clsx";
import { durationToBeats } from "@/global/classes/Beat";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Switch, TooltipClassName } from "@openmarch/ui";
import { useFullscreenStore } from "@/stores/FullscreenStore";
import { T, useTolgee } from "@tolgee/react";
import * as ToolTip from "@radix-ui/react-tooltip";
import {
    deletePageYankMutationOptions,
    deletePagesMutationOptions,
    ModifyPagesRequest,
    updatePagesMutationOptions,
} from "@/hooks/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelectionStore } from "@/stores/SelectionStore";
import {
    getAvailableOffsets,
    useCreateLastPageOnTimeline,
} from "./PageTimeline.utils";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { useIsTouchMode } from "@/stores/InputModeStore";

const PAGE_MENU_CLASS =
    "bg-modal text-text rounded-6 border-stroke shadow-modal z-50 m-6 flex flex-col gap-8 border p-16 py-12 backdrop-blur-md";

// eslint-disable-next-line max-lines-per-function
export default function PageTimeline() {
    const queryClient = useQueryClient();
    const { uiSettings } = useUiSettingsStore();
    const { isPlaying } = useIsPlaying()!;
    const { selectedPage, setSelectedPage } = useSelectedPage()!;
    const { setSelectedShapePageIds } = useSelectionStore()!;
    const { isFullscreen } = useFullscreenStore();
    const { pages, beats } = useTimingObjects()!;
    const isTouchMode = useIsTouchMode();
    const { mutate: updatePages } = useMutation(
        updatePagesMutationOptions(queryClient),
    );
    const { mutate: deletePages } = useMutation(
        deletePagesMutationOptions(queryClient),
    );
    const { mutate: deletePageYank } = useMutation(
        deletePageYankMutationOptions(queryClient),
    );

    // Page clicking and dragging
    const resizingPage = useRef<Page | null>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [currentDragCounts, setCurrentDragCounts] = useState<{
        [pageId: number]: number;
    }>({});
    const startX = useRef(0);
    const startWidth = useRef(0);
    const availableOffsets = useRef<number[]>([]);

    const { mutate: createDefaultTempoGroupAndPage } =
        useCreateLastPageOnTimeline();
    // Creating a page needs the workspace settings, which load asynchronously
    const { data: workspaceSettings } = useQuery(
        workspaceSettingsQueryOptions(),
    );
    const { t } = useTolgee();

    // Calculate the width of a page based on its duration
    // Add a small buffer to ensure the page visually includes all its beats
    const getWidth = useCallback(
        (page: Page) => {
            // Use the page's duration to calculate the width
            // Add a small buffer (equivalent to 1 beat) to ensure all beats are visually included
            return page.duration * uiSettings.timelinePixelsPerSecond;
        },
        [uiSettings.timelinePixelsPerSecond],
    );

    // Pixels a press may wander and still count as a tap
    const TAP_SLOP_PX = 6;
    // Removes the document listeners of the drag in progress
    const resizeCleanup = useRef<(() => void) | null>(null);

    /** Puts the dragged page (and the next one) back to their stored widths. */
    const restorePageWidths = useCallback(
        (page: Page) => {
            const index = pages.findIndex((p) => p.id === page.id);
            for (const p of [pages[index], pages[index + 1]]) {
                if (!p) continue;
                const element = document.querySelector(
                    `[timeline-page-id="${p.id}"]`,
                );
                if (element instanceof HTMLElement) {
                    element.style.width = `${getWidth(p)}px`;
                    delete element.dataset.newDuration;
                }
            }
        },
        [pages, getWidth],
    );

    const resetResizeState = useCallback(() => {
        resizingPage.current = null;
        setIsResizing(false);
        setCurrentDragCounts({});
        startX.current = 0;
        startWidth.current = 0;
    }, []);

    // Function to handle the start of resizing (mouse, pen or finger)
    const handlePageResizeStart = (
        e: React.PointerEvent<HTMLElement>,
        page: Page,
    ) => {
        if (isPlaying) return; // Don't allow resizing during playback
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (resizingPage.current) return; // one drag at a time

        e.preventDefault();
        e.stopPropagation(); // Prevent triggering page selection

        resizingPage.current = page;
        setIsResizing(true);
        startX.current = e.clientX;
        startWidth.current = getWidth(page);
        availableOffsets.current = getAvailableOffsets({
            currentPage: page,
            nextPage: pages[pages.indexOf(page) + 1] || null,
            allBeats: beats,
        }).map((offset) => offset * uiSettings.timelinePixelsPerSecond);

        // Keep receiving this pointer's moves even when it leaves the handle
        const handle = e.currentTarget;
        const pointerId = e.pointerId;
        try {
            handle.setPointerCapture?.(pointerId);
        } catch {
            // The pointer may already be gone
        }

        const startClientX = e.clientX;
        let moved = false;
        const isOurs = (ev: PointerEvent) =>
            ev.pointerId === undefined || ev.pointerId === pointerId;

        const onMove = (ev: PointerEvent) => {
            if (!isOurs(ev)) return;
            if (Math.abs(ev.clientX - startClientX) > TAP_SLOP_PX) moved = true;
            handlePageResizeMove(ev);
        };
        const onUp = (ev: PointerEvent) => {
            if (!isOurs(ev)) return;
            cleanup();
            if (!moved && ev.pointerType !== "mouse") {
                // A tap on the edge selects the page, as a tap on the page does
                restorePageWidths(page);
                resetResizeState();
                setSelectedPage(page);
                setSelectedShapePageIds([]);
                return;
            }
            void handlePageResizeEnd();
        };
        const onCancel = (ev: PointerEvent) => {
            if (!isOurs(ev)) return;
            cleanup();
            restorePageWidths(page);
            resetResizeState();
        };
        const cleanup = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onCancel);
            try {
                if (handle.hasPointerCapture?.(pointerId))
                    handle.releasePointerCapture(pointerId);
            } catch {
                // Already released
            }
            resizeCleanup.current = null;
        };

        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onCancel);
        resizeCleanup.current = cleanup;
    };

    // Function to handle resizing movement
    const handlePageResizeMove = useCallback(
        (e: MouseEvent) => {
            if (!resizingPage.current) return;

            // Find the next page
            const currentPageIndex = pages.findIndex(
                (page) => page.id === resizingPage.current!.id,
            );
            const nextPageIndex = currentPageIndex + 1;
            const nextPage =
                nextPageIndex < pages.length ? pages[nextPageIndex] : null;

            const deltaX = e.clientX - startX.current;
            const closestOffset = availableOffsets.current.reduce((a, b) => {
                return Math.abs(b - deltaX) < Math.abs(a - deltaX) ? b : a;
            });
            const newWidth = startWidth.current + closestOffset;

            // Calculate new duration based on the new width
            const newDuration = newWidth / uiSettings.timelinePixelsPerSecond;

            // Calculate new counts for the counts label
            const newBeats = durationToBeats({
                newDuration,
                allBeats: beats,
                startBeat: resizingPage.current.beats[0],
            });
            const newCounts = newBeats.length;

            // Update the current drag counts for the counts label
            setCurrentDragCounts((prev) => ({
                ...prev,
                [resizingPage.current!.id]: newCounts,
            }));

            // Update the visual width immediately for smooth dragging
            const pageElement = document.querySelector(
                `[timeline-page-id="${resizingPage.current.id}"]`,
            );
            if (pageElement instanceof HTMLElement) {
                pageElement.style.width = `${newWidth}px`;
                // Store the new duration as a data attribute for later use
                pageElement.dataset.newDuration = newDuration.toString();
            }

            // Update the next page's width if it exists
            if (nextPage) {
                const nextPageElement = document.querySelector(
                    `[timeline-page-id="${nextPage.id}"]`,
                );
                if (nextPageElement instanceof HTMLElement) {
                    // The next page's width changes in the opposite direction
                    const nextPageBuffer =
                        nextPage.beats.length > 0
                            ? nextPage.beats[0].duration
                            : 0;
                    const nextPageOriginalWidth = getWidth(nextPage);
                    const finalNextPageWidth =
                        nextPageOriginalWidth - closestOffset;

                    // Update the next page's visual width
                    nextPageElement.style.width = `${finalNextPageWidth}px`;

                    // Calculate and store the next page's new duration
                    const nextPageNewDuration =
                        finalNextPageWidth /
                            uiSettings.timelinePixelsPerSecond -
                        nextPageBuffer;
                    nextPageElement.dataset.newDuration =
                        nextPageNewDuration.toString();
                }
            }
        },
        [pages, uiSettings.timelinePixelsPerSecond, beats, getWidth],
    );

    // Function to handle the end of resizing
    const handlePageResizeEnd = useCallback(async () => {
        const pageElement = document.querySelector(
            `[timeline-page-id="${resizingPage.current?.id}"]`,
        );

        if (
            resizingPage.current &&
            resizingPage.current.beats.length > 0 &&
            pageElement instanceof HTMLElement &&
            pageElement.dataset.newDuration
        ) {
            const newDuration = parseFloat(pageElement.dataset.newDuration);

            // Find the next page
            const currentPageIndex = pages.findIndex(
                (page) => page.id === resizingPage.current!.id,
            );
            const nextPageIndex = currentPageIndex + 1;
            const nextPage =
                nextPageIndex < pages.length ? pages[nextPageIndex] : null;

            const newBeats = durationToBeats({
                newDuration,
                allBeats: beats,
                startBeat: resizingPage.current.beats[0],
            });
            const updateArgs: ModifyPagesRequest = updatePageCountRequest({
                pages,
                beats,
                pageToUpdate: resizingPage.current,
                // The last page is a special case and should be adjusted accordingly
                newCounts: newBeats.length - (nextPage ? 0 : 1),
            });

            await updatePages(updateArgs);

            // Clean up the data attribute
            delete pageElement.dataset.newDuration;
        }

        resetResizeState();
    }, [pages, beats, updatePages, resetResizeState]);

    // Clean up event listeners when component unmounts
    useEffect(() => {
        return () => resizeCleanup.current?.();
    }, []);

    function nextPageBeatDiff(nextPageId: number, currId: number): number {
        const currPageDrag = currentDragCounts[currId];
        const currPage = pages.find((p) => p.id === currId);
        const nextPage = pages.find((p) => p.id === nextPageId);
        if (!nextPage || !currPage) return 0;
        return nextPage.counts + (currPage.counts - currPageDrag || 0);
    }

    const handleDeletePage = useCallback(
        (page: Page) => {
            deletePages(new Set([page.id]), {
                onSuccess: () => {
                    if (page.previousPageId != null)
                        setSelectedPage({ id: page.previousPageId });
                },
            });
        },
        [deletePages, setSelectedPage],
    );
    const handleDeletePageYank = useCallback(
        (page: Page) => {
            deletePageYank(page.id, {
                onSuccess: () => {
                    if (page.previousPageId != null)
                        setSelectedPage({ id: page.previousPageId });
                },
            });
        },
        [deletePageYank, setSelectedPage],
    );
    /** "counts | next page counts" for the page being resized (or as stored). */
    const resizeCountsLabel = (page: Page) => (
        <>
            {(resizingPage.current?.id === page.id &&
                currentDragCounts[page.id]) ||
                page.counts}{" "}
            {/* calculates the next page count based on the difference */}
            {page.nextPageId &&
                `| ${nextPageBeatDiff(page.nextPageId, page.id)}`}
        </>
    );

    /** The page menu body, shared by the right-click menu and the "…" button. */
    const renderPageMenu = (page: Page) => (
        <>
            <h5 className="text-h5">
                {t("timeline.page.contextMenu.title", {
                    pageName: page.name,
                })}
            </h5>

            <div className="flex w-full items-center justify-between gap-8">
                <label className="text-body text-text-subtitle">
                    <T keyName="timeline.page.contextMenu.subsetToggle" />
                </label>
                <Switch
                    onClick={() => {
                        updatePages({
                            modifiedPagesArgs: [
                                {
                                    id: page.id,
                                    is_subset: !page.isSubset,
                                },
                            ],
                        });
                    }}
                    checked={page?.isSubset || false}
                />
            </div>
            <div className="border-stroke flex w-full flex-col items-start gap-8 border-t pt-8">
                <div className="text-text flex items-center gap-6 text-xs">
                    <TrashIcon size={16} />
                    <T keyName="timeline.page.contextMenu.delete" />
                </div>
                <ToolTip.Root delayDuration={500}>
                    <ToolTip.Trigger asChild>
                        <button
                            className="text-body text-text-subtitle hover:text-red touch:min-h-44 cursor-pointer text-left transition-colors"
                            onClick={() => handleDeletePageYank(page)}
                        >
                            <T keyName="timeline.page.contextMenu.deleteYank" />
                        </button>
                    </ToolTip.Trigger>
                    <ToolTip.Portal>
                        <ToolTip.Content
                            className={TooltipClassName}
                            side="right"
                        >
                            {t("timeline.page.contextMenu.deleteYankTooltip")}
                        </ToolTip.Content>
                    </ToolTip.Portal>
                </ToolTip.Root>
                <ToolTip.Root delayDuration={500}>
                    <ToolTip.Trigger asChild>
                        <button
                            className="text-body text-text-subtitle hover:text-red touch:min-h-44 cursor-pointer text-left transition-colors"
                            onClick={() => handleDeletePage(page)}
                        >
                            <T keyName="timeline.page.contextMenu.deleteInPlace" />
                        </button>
                    </ToolTip.Trigger>
                    <ToolTip.Portal>
                        <ToolTip.Content
                            className={TooltipClassName}
                            side="right"
                        >
                            {t(
                                "timeline.page.contextMenu.deleteInPlaceTooltip",
                            )}
                        </ToolTip.Content>
                    </ToolTip.Portal>
                </ToolTip.Root>
            </div>
        </>
    );

    return (
        <div className="flex h-fit gap-0" id="pages">
            {/* ------------------------------------ FIRST PAGE ------------------------------------ */}
            <ul className="rounded-6 border-stroke flex h-fit gap-0 overflow-clip border">
                {pages.length > 0 && (
                    <li
                        className={clsx(
                            "rounded-l-6 bg-fg-2 touch:min-h-44 flex h-full w-[40px] items-center justify-center border px-10 py-4 font-mono",
                            !isPlaying && "cursor-pointer",
                            pages[0].id === selectedPage?.id
                                ? [
                                      "border-accent",
                                      isPlaying &&
                                          "text-text/75 pointer-events-none",
                                  ]
                                : [
                                      "border-stroke",
                                      isPlaying &&
                                          "text-text/75 pointer-events-none",
                                  ],
                        )}
                        onClick={() => {
                            setSelectedPage(pages[0]);
                            setSelectedShapePageIds([]);
                        }}
                        title={t("timeline.page.firstPage")}
                        aria-label={t("timeline.page.firstPage")}
                        timeline-page-id={pages[0].id}
                    >
                        <div>{pages[0].name}</div>
                    </li>
                )}
                {/* ------------------------------------ PAGES ------------------------------------ */}
                {/* eslint-disable-next-line max-lines-per-function */}
                {pages.map((page, index) => {
                    if (index === 0) return null;
                    const width = getWidth(page);
                    const selectedIndex = pages.findIndex(
                        (p) => p.id === selectedPage?.id,
                    );
                    return (
                        <ContextMenu.Root
                            key={index}
                            aria-label={t("timeline.page.label", {
                                pageName: page.name,
                            })}
                        >
                            <ContextMenu.Trigger
                                disabled={isPlaying || isFullscreen}
                                className="group"
                            >
                                <div
                                    className="relative h-full overflow-clip"
                                    timeline-page-id={page.id}
                                    style={{ width: `${width}px` }}
                                >
                                    <div
                                        className={clsx(
                                            "bg-fg-2 text-body text-text group-last:rounded-r-6 touch:min-h-44 relative flex h-full items-center justify-end overflow-clip border px-8 py-4 font-mono",
                                            !isPlaying && "cursor-pointer",
                                            page.id === selectedPage?.id
                                                ? [
                                                      "border-accent",
                                                      isPlaying &&
                                                          "text-text/75 pointer-events-none",
                                                  ]
                                                : [
                                                      "border-stroke",
                                                      isPlaying &&
                                                          "text-text/75 pointer-events-none",
                                                  ],
                                        )}
                                        onClick={() => {
                                            if (!isPlaying)
                                                setSelectedPage(page);
                                            setSelectedShapePageIds([]);
                                        }}
                                    >
                                        <div className="rig static z-10">
                                            {page.name}
                                        </div>
                                        {/* ------ progress bar (fullscreen) ------ */}
                                        {(selectedIndex === index - 1 ||
                                            (selectedIndex === 0 &&
                                                index === pages.length)) &&
                                            isPlaying && (
                                                <div
                                                    className={clsx(
                                                        "absolute top-0 left-0 z-0 h-full w-full",
                                                        !isFullscreen
                                                            ? "bg-accent/25"
                                                            : "bg-accent/25",
                                                    )}
                                                    style={{
                                                        animation: `progress ${page.duration}s linear forwards`,
                                                    }}
                                                />
                                            )}
                                    </div>
                                    {/* ------ page menu button (touch) ------ */}
                                    {isTouchMode &&
                                        page.id === selectedPage?.id &&
                                        !isPlaying &&
                                        !isFullscreen && (
                                            <DropdownMenu.Root>
                                                <DropdownMenu.Trigger asChild>
                                                    <button
                                                        type="button"
                                                        className="text-text hover:text-accent absolute top-0 left-0 z-20 flex h-full w-44 items-center justify-center"
                                                        aria-label={t(
                                                            "timeline.page.menuButton",
                                                            {
                                                                pageName:
                                                                    page.name,
                                                            },
                                                        )}
                                                        onClick={(e) =>
                                                            e.stopPropagation()
                                                        }
                                                    >
                                                        <DotsThreeIcon
                                                            size={22}
                                                            weight="bold"
                                                        />
                                                    </button>
                                                </DropdownMenu.Trigger>
                                                <DropdownMenu.Portal>
                                                    <DropdownMenu.Content
                                                        className={
                                                            PAGE_MENU_CLASS
                                                        }
                                                        side="top"
                                                        align="start"
                                                    >
                                                        {renderPageMenu(page)}
                                                    </DropdownMenu.Content>
                                                </DropdownMenu.Portal>
                                            </DropdownMenu.Root>
                                        )}
                                    {/* ------ counts while resizing (touch) ------ */}
                                    {isTouchMode &&
                                        resizingPage.current?.id ===
                                            page.id && (
                                            <div
                                                className="bg-accent text-text-invert rounded-4 text-sub pointer-events-none absolute top-1/2 left-4 z-30 -translate-y-1/2 px-6 font-mono whitespace-nowrap"
                                                data-testid="page-resize-counts"
                                            >
                                                {resizeCountsLabel(page)}
                                            </div>
                                        )}
                                    {/* ------ page resize dragging ------ */}
                                    {!isFullscreen && (
                                        <ToolTip.Root
                                            key={`tooltip-${page.id}-${isResizing && resizingPage.current?.id === page.id ? "resizing" : "normal"}`}
                                            open={
                                                isTouchMode
                                                    ? false
                                                    : isResizing &&
                                                        resizingPage.current
                                                            ?.id === page.id
                                                      ? true
                                                      : undefined
                                            }
                                            delayDuration={100}
                                        >
                                            <ToolTip.Trigger asChild>
                                                <div
                                                    className={clsx(
                                                        "touch:w-44 absolute top-0 right-0 z-20 flex h-full w-16 cursor-ew-resize touch-none items-center justify-end transition-colors select-none",
                                                        resizingPage.current
                                                            ?.id === page.id
                                                            ? "bg-accent/50"
                                                            : "hover:bg-accent/30 bg-transparent",
                                                    )}
                                                    hidden={isPlaying}
                                                    data-testid="page-resize-handle"
                                                    aria-label={t(
                                                        "timeline.page.resizeHandle",
                                                        {
                                                            pageName: page.name,
                                                        },
                                                    )}
                                                    onPointerDown={(e) =>
                                                        handlePageResizeStart(
                                                            e,
                                                            page,
                                                        )
                                                    }
                                                >
                                                    {/* grip: always visible for fingers */}
                                                    <span className="bg-text-subtitle touch:block mr-4 hidden h-[60%] w-4 rounded-full" />
                                                </div>
                                            </ToolTip.Trigger>
                                            <ToolTip.Portal>
                                                <ToolTip.Content
                                                    className={TooltipClassName}
                                                >
                                                    {resizeCountsLabel(page)}
                                                </ToolTip.Content>
                                            </ToolTip.Portal>
                                        </ToolTip.Root>
                                    )}
                                </div>
                            </ContextMenu.Trigger>
                            {/* ------ context menu ------ */}
                            <ContextMenu.Portal>
                                <ContextMenu.Content
                                    className={PAGE_MENU_CLASS}
                                >
                                    {renderPageMenu(page)}
                                </ContextMenu.Content>
                            </ContextMenu.Portal>
                        </ContextMenu.Root>
                    );
                })}
            </ul>
            {!isFullscreen && (
                <button
                    className="bg-accent text-sub text-text-invert ml-8 flex size-[28px] cursor-pointer items-center justify-center self-center rounded-full duration-150 ease-out enabled:hover:-translate-y-2 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => createDefaultTempoGroupAndPage()}
                    disabled={!workspaceSettings}
                >
                    <PlusIcon size={20} />
                </button>
            )}
        </div>
    );
}
