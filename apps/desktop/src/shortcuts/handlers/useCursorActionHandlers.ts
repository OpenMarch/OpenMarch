import { createCircle } from "@openmarch/core";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useCreateMarcherShape } from "@/global/classes/canvasObjects/MarcherShape";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useUpdateSelectedMarchersOnSelectedPage } from "@/hooks/queries";
import { PAGE_SHAPES_TIMELINE_MESSAGE } from "@/db-functions/shapePages";
import { TimelineWriteError } from "@/db-functions/timelineErrors";
import { toastTimelineError } from "@/timeline/timelineErrorMessages";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import { useSelectionStore } from "@/stores/SelectionStore";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";
import { useUpdateCoordinates } from "./useUpdateCoordinates";

// eslint-disable-next-line max-lines-per-function
export function useCursorActionHandlers() {
    const { selectedPage, ready, selectedMarchers, timelineMode } =
        useEditorReadiness();
    const selectedMarchersContext = useSelectedMarchers();
    const setSelectedMarchers =
        selectedMarchersContext?.setSelectedMarchers ?? (() => {});
    const updateCoordinates = useUpdateCoordinates();
    const { mutate: createMarcherShape } = useCreateMarcherShape();
    const selectionStore = useSelectionStore();
    const setSelectedShapePageIds =
        selectionStore?.setSelectedShapePageIds ?? (() => {});
    const alignmentEventStore = useAlignmentEventStore();
    const resetAlignmentEvent =
        alignmentEventStore?.resetAlignmentEvent ?? (() => {});
    const setAlignmentEvent =
        alignmentEventStore?.setAlignmentEvent ?? (() => {});
    const setAlignmentEventMarchers =
        alignmentEventStore?.setAlignmentEventMarchers ?? (() => {});
    const alignmentEventNewMarcherPages =
        alignmentEventStore?.alignmentEventNewMarcherPages ?? [];
    const alignmentEventMarchers =
        alignmentEventStore?.alignmentEventMarchers ?? [];
    const { mutate: updateSelectedMarchers } =
        useUpdateSelectedMarchersOnSelectedPage();

    // Not gated on `ready`: resetting the alignment event is what clears a half-drawn line
    // (via the listener swap in Canvas), and that must work even while page data is loading.
    useActionHandler("cancelAlignmentUpdates", () => {
        if (alignmentEventMarchers.length > 0) {
            setSelectedMarchers(alignmentEventMarchers);
            resetAlignmentEvent();
        } else {
            // Deselect all shapes and marchers
            setSelectedMarchers([]);
            setSelectedShapePageIds([]);
        }
    });

    useActionHandler(
        "applyQuickShape",
        () => {
            updateCoordinates(
                alignmentEventNewMarcherPages.map((marcherPage) => ({
                    marcher_id: marcherPage.marcher_id,
                    page_id: marcherPage.page_id,
                    x: marcherPage.x as number,
                    y: marcherPage.y as number,
                    notes: marcherPage.notes || undefined,
                })),
            );
            resetAlignmentEvent();
        },
        { enabled: ready && alignmentEventNewMarcherPages.length > 0 },
    );

    useActionHandler(
        "createMarcherShape",
        () => {
            if (timelineMode) {
                // Page shapes write shape pages and marcher_pages (P7.11). The line's
                // positions can still be applied, so the alignment stays open.
                toastTimelineError(
                    new TimelineWriteError(
                        "E-ARGS",
                        PAGE_SHAPES_TIMELINE_MESSAGE,
                    ),
                );
                return;
            }
            const firstMarcherPage = alignmentEventNewMarcherPages[0];
            const lastMarcherPage =
                alignmentEventNewMarcherPages[
                    alignmentEventNewMarcherPages.length - 1
                ];
            const marcherIds = alignmentEventNewMarcherPages.map(
                (marcherPage) => marcherPage.marcher_id,
            );
            createMarcherShape({
                marcherIds,
                start: firstMarcherPage,
                end: lastMarcherPage,
                pageId: selectedPage!.id,
            });
            resetAlignmentEvent();
        },
        { enabled: ready && alignmentEventNewMarcherPages.length > 0 },
    );

    useActionHandler(
        "alignmentEventDefault",
        () => {
            resetAlignmentEvent();
        },
        { enabled: ready },
    );

    useActionHandler(
        "alignmentEventLine",
        () => {
            if (selectedMarchers.length < 2) {
                console.error(
                    "Not enough marchers selected to create a line. Need at least 2 marchers selected.",
                );
                return;
            }
            setAlignmentEvent("line");
            setAlignmentEventMarchers(selectedMarchers);
            setSelectedMarchers([]);
        },
        { enabled: ready && selectedMarchers.length >= 2 },
    );

    useActionHandler(
        "selectAllMarchers",
        () => {
            const canvas = window.canvas as OpenMarchCanvas | undefined;
            if (!canvas) {
                return;
            }

            canvas.setActiveObjects(canvas.getCanvasMarchers());
        },
        { enabled: ready },
    );

    useActionHandler(
        "createCircle",
        () => {
            updateSelectedMarchers(({ currentCoordinates }) => {
                const updatedCoordinates = createCircle(
                    currentCoordinates.map((mp) => ({
                        id: mp.marcher_id,
                        x: mp.x,
                        y: mp.y,
                    })),
                    {
                        centerX: 0,
                        centerY: 0,
                        radius: 10,
                    },
                );

                return updatedCoordinates.map((coordinate) => ({
                    marcher_id: coordinate.id,
                    x: coordinate.x,
                    y: coordinate.y,
                }));
            });
        },
        { enabled: ready && selectedMarchers.length > 0 },
    );
}
