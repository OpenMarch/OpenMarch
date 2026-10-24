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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectionStore } from "@/stores/SelectionStore";
import { getAvailableOffsets, useAddPage } from "./PageTimeline.utils";
import { useIsTouchMode } from "@/stores/InputModeStore";

/** Narrower selected pages show no "…" button (use long-press instead). */
const MENU_BUTTON_MIN_PAGE_WIDTH = 120;

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

    const { addPage, canAddPage } = useAddPage();
    // The page whose "…" menu is open, if any
    const [dropdownPageId, setDropdownPageId] = useState<number | null>(null);
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
            if (!moved) {
                // A tap on the edge selects the page under the finger, as a tap
                // on the page does. In touch mode the handle straddles the edge,
                // so its right half lies over the next page.
                restorePageWidths(page);
                resetResizeState();
                const rect = handle.getBoundingClientRect();
                const next =
                    pages[pages.findIndex((p) => p.id === page.id) + 1];
                const tapped =
                    next && ev.clientX > rect.left + rect.width / 2
                        ? next
                        : page;
                setSelectedPage(tapped);
                setSelectedShapePageIds([]);
                return;
            }
            void handlePageResizeEnd();
        };
        const cancel = () => {
            cleanup();
            restorePageWidths(page);
            resetResizeState();
        };
        const onCancel = (ev: PointerEvent) => {
            if (isOurs(ev)) cancel();
        };
        // A second finger means a two-finger scroll or pinch, not an edit:
        // drop the drag and put the pages back
        const onOtherPointerDown = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) cancel();
        };
        const cleanup = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onCancel);
            window.removeEventListener("pointerdown", onOtherPointerDown, true);
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
        window.addEventListener("pointerdown", onOtherPointerDown, true);
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

    /**
     * "Page 1: 12 · Page 2: 4" while dragging an edge with a finger: the
     * edge is shared, so the next page gives up (or gets) the counts.
     */
    const resizeCountsNamedLabel = (page: Page) => {
        const counts =
            (resizingPage.current?.id === page.id &&
                currentDragCounts[page.id]) ||
            page.counts;
        const next = pages.find((p) => p.id === page.nextPageId);
        return (
            <>
                {t("timeline.page.countsLabel", {
                    pageName: page.name,
                    counts,
                })}
                {next &&
                    ` · ${t("timeline.page.countsLabel", {
                        pageName: next.name,
                        counts: nextPageBeatDiff(next.id, page.id),
                    })}`}
            </>
        );
    };

    /** The page menu body, shared by the right-click menu and the "…" button. */
    const renderPageMenu = (page: Page) => (
        <>
            <h5 className="text-h5">
                {t("timeline.page.contextMenu.title", {
                    pageName: page.name,
                })}
            </h5>

            <div className="touch:min-h-44 flex w-full items-center justify-between gap-8">
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
            <button
                className="text-body text-text hover:text-accent touch:min-h-44 flex w-full cursor-pointer items-center gap-6 text-left transition-colors"
                onClick={() => addPage()}
                disabled={!canAddPage}
            >
                <PlusIcon size={16} />
                {t("timeline.page.addAtEnd")}
            </button>
            {/* Deleting is set well apart from the Subset switch */}
            <div className="border-stroke touch:mt-8 touch:pt-12 touch:gap-4 flex w-full flex-col items-start gap-8 border-t pt-8">
                <div className="text-text flex items-center gap-6 text-xs">
                    <TrashIcon size={16} />
                    <T keyName="timeline.page.contextMenu.delete" />
                </div>
                {renderDeleteRow(
                    "timeline.page.contextMenu.deleteYank",
                    "timeline.page.contextMenu.deleteYankTooltip",
                    () => handleDeletePageYank(page),
                )}
                {renderDeleteRow(
                    "timeline.page.contextMenu.deleteInPlace",
                    "timeline.page.contextMenu.deleteInPlaceTooltip",
                    () => handleDeletePage(page),
                )}
            </div>
        </>
    );

    /**
     * One way to delete the page. With a mouse the explanation is a tooltip;
     * fingers can't hover, so touch mode shows it under the label in a
     * full-width, 44px row.
     */
    const renderDeleteRow = (
        labelKey: string,
        descriptionKey: string,
        onDelete: () => void,
    ) => (
        <ToolTip.Root delayDuration={500}>
            <ToolTip.Trigger asChild>
                <button
                    className="text-body text-text-subtitle hover:text-red touch:min-h-44 touch:w-full touch:max-w-[260px] touch:flex touch:flex-col touch:justify-center touch:rounded-6 touch:border touch:border-stroke touch:px-8 touch:py-4 touch:text-text cursor-pointer text-left transition-colors"
                    onClick={onDelete}
                >
                    <T keyName={labelKey} />
                    {/* the space keeps read-out text (long-press tips) apart */}
                    {isTouchMode && " "}
                    {isTouchMode && (
                        <span className="text-sub text-text-subtitle">
                            {t(descriptionKey)}
                        </span>
                    )}
                </button>
            </ToolTip.Trigger>
            {!isTouchMode && (
                <ToolTip.Portal>
                    <ToolTip.Content className={TooltipClassName} side="right">
                        {t(descriptionKey)}
                    </ToolTip.Content>
                </ToolTip.Portal>
            )}
        </ToolTip.Root>
    );

    return (
        <div className="flex h-fit flex-1 gap-0" id="pages">
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
                    // The "…" button only on a selected page wide enough that
                    // most of it is still there to tap
                    const showMenuButton =
                        isTouchMode &&
                        page.id === selectedPage?.id &&
                        !isPlaying &&
                        !isFullscreen &&
                        width >= MENU_BUTTON_MIN_PAGE_WIDTH;
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
                                // Off while this page's "…" menu is open: the
                                // menu is portalled, but React still bubbles
                                // its presses here, and a long press in it
                                // would open a second copy as a context menu
                                disabled={
                                    isPlaying ||
                                    isFullscreen ||
                                    dropdownPageId === page.id
                                }
                                className="group"
                            >
                                <div
                                    className="touch:overflow-visible relative h-full overflow-clip"
                                    timeline-page-id={page.id}
                                    style={{ width: `${width}px` }}
                                >
                                    <div
                                        className={clsx(
                                            "bg-fg-2 text-body text-text group-last:rounded-r-6 touch:min-h-44 touch:pr-28 relative flex h-full items-center justify-end overflow-clip border px-8 py-4 font-mono",
                                            // keep the name clear of the "…" button
                                            showMenuButton &&
                                                "touch:justify-start touch:pr-72",
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
                                    {showMenuButton && (
                                        <PageMenuButton
                                            onOpenChange={(open) =>
                                                setDropdownPageId(
                                                    open ? page.id : null,
                                                )
                                            }
                                            label={t(
                                                "timeline.page.menuButton",
                                                { pageName: page.name },
                                            )}
                                        >
                                            {renderPageMenu(page)}
                                        </PageMenuButton>
                                    )}
                                    {/* ------ counts while resizing (touch) ------ */}
                                    {isTouchMode &&
                                        resizingPage.current?.id ===
                                            page.id && (
                                            <div
                                                className="bg-accent text-text-invert rounded-4 text-sub pointer-events-none absolute top-1/2 left-4 z-40 -translate-y-1/2 px-6 font-mono whitespace-nowrap"
                                                data-testid="page-resize-counts"
                                            >
                                                {resizeCountsNamedLabel(page)}
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
                                                        "touch:w-44 touch:-right-22 touch:justify-center absolute top-0 right-0 z-30 flex h-full w-16 cursor-ew-resize touch-none items-center justify-end transition-colors select-none",
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
                                                    <span className="bg-text-subtitle touch:block hidden h-[60%] w-4 rounded-full" />
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
            {/* New page right after the last page (with fingers it is the
                labelled button in the label column instead: NewPageButton) */}
            {!isFullscreen && !isTouchMode && (
                <button
                    className="bg-accent text-sub text-text-invert ml-8 flex size-[28px] shrink-0 cursor-pointer items-center justify-center self-center rounded-full duration-150 ease-out enabled:hover:-translate-y-2 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => addPage()}
                    disabled={!canAddPage}
                    aria-label={t("timeline.page.add")}
                    title={t("timeline.page.add")}
                    data-testid="add-page"
                >
                    <PlusIcon size={20} />
                </button>
            )}
        </div>
    );
}

/**
 * The selected page's "…" button. Radix opens a menu on pointerdown, so a
 * two-finger scroll that lands on the button would open it. This one opens
 * on click instead (press and release without moving), and not at all if
 * another finger joined while it was down.
 */
function PageMenuButton({
    label,
    children,
    onOpenChange,
}: {
    label: string;
    children: React.ReactNode;
    /** Told when the menu opens and closes */
    onOpenChange?: (open: boolean) => void;
}) {
    const [open, setOpenState] = useState(false);
    const setOpen = (next: boolean) => {
        setOpenState(next);
        onOpenChange?.(next);
    };
    // Unmounted while open (e.g. the page was deselected): report it closed
    const onOpenChangeRef = useRef(onOpenChange);
    onOpenChangeRef.current = onOpenChange;
    const openRef = useRef(open);
    openRef.current = open;
    useEffect(
        () => () => {
            if (openRef.current) onOpenChangeRef.current?.(false);
        },
        [],
    );
    const armed = useRef(false);

    const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
        // Keeps Radix from opening on press
        e.preventDefault();
        e.stopPropagation();
        armed.current = true;
        const pointerId = e.pointerId;
        const onOtherDown = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) armed.current = false;
        };
        const onCancel = () => {
            armed.current = false;
        };
        const stop = () => {
            window.removeEventListener("pointerdown", onOtherDown, true);
            window.removeEventListener("pointercancel", onCancel, true);
            window.removeEventListener("pointerup", stopSoon, true);
        };
        // Leave the listeners up until the click that follows this release
        const stopSoon = () => setTimeout(stop, 0);
        window.addEventListener("pointerdown", onOtherDown, true);
        window.addEventListener("pointercancel", onCancel, true);
        window.addEventListener("pointerup", stopSoon, true);
    };

    return (
        <DropdownMenu.Root open={open} onOpenChange={setOpen}>
            <DropdownMenu.Trigger asChild>
                <button
                    type="button"
                    className="text-text hover:text-accent group absolute top-0 right-22 z-20 flex h-full w-44 items-center justify-center"
                    aria-label={label}
                    onPointerDown={handlePointerDown}
                    onClick={(e) => {
                        e.stopPropagation();
                        // Keyboard activation (detail 0) has no press to check
                        if (e.detail === 0 || armed.current) setOpen(true);
                        armed.current = false;
                    }}
                >
                    {/* a visible chip, so the target reads as a button */}
                    <span className="border-stroke bg-fg-1 rounded-6 flex h-32 w-36 items-center justify-center border">
                        <DotsThreeIcon size={22} weight="bold" />
                    </span>
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    className={PAGE_MENU_CLASS}
                    side="top"
                    align="end"
                >
                    {children}
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
}
