import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCircle } from "@openmarch/core";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useCreateMarcherShape } from "@/global/classes/canvasObjects/MarcherShape";
import type OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import {
    updateMarcherPagesMutationOptions,
    useUpdateSelectedMarchersOnSelectedPage,
} from "@/hooks/queries";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import { useSelectionStore } from "@/stores/SelectionStore";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";

// eslint-disable-next-line max-lines-per-function
export function useCursorActionHandlers() {
    const queryClient = useQueryClient();
    const { selectedPage, ready, selectedMarchers } = useEditorReadiness();
    const selectedMarchersContext = useSelectedMarchers();
    const setSelectedMarchers =
        selectedMarchersContext?.setSelectedMarchers ?? (() => {});
    const { mutate: updateMarcherPages } = useMutation(
        updateMarcherPagesMutationOptions(queryClient),
    );
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

    useActionHandler(
        "cancelAlignmentUpdates",
        () => {
            if (alignmentEventMarchers.length > 0) {
                setSelectedMarchers(alignmentEventMarchers);
                resetAlignmentEvent();
            } else {
                // Deselect all shapes and marchers
                setSelectedMarchers([]);
                setSelectedShapePageIds([]);
            }
        },
        { enabled: ready },
    );

    useActionHandler(
        "applyQuickShape",
        () => {
            updateMarcherPages(
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
        { enabled: ready },
    );

    useActionHandler(
        "createMarcherShape",
        () => {
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
        { enabled: ready },
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
        { enabled: ready },
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
        { enabled: ready },
    );
}
