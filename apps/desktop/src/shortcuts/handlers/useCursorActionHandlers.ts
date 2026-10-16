import { createCircle } from "@openmarch/core";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useUpdateSelectedMarchersOnSelectedPage } from "@/hooks/queries";
import { useAlignmentEventStore } from "@/stores/AlignmentEventStore";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import { useActionHandler } from "../useActionHandler";
import { useEditorReadiness } from "./useEditorReadiness";
import { useUpdateCoordinates } from "./useUpdateCoordinates";

// eslint-disable-next-line max-lines-per-function
export function useCursorActionHandlers() {
    const { ready, selectedMarchers } = useEditorReadiness();
    const selectedMarchersContext = useSelectedMarchers();
    const setSelectedMarchers =
        selectedMarchersContext?.setSelectedMarchers ?? (() => {});
    const updateCoordinates = useUpdateCoordinates();
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
            // Deselect all marchers
            setSelectedMarchers([]);
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
            // The field selects through its editor
            activeFieldEditor()?.selectAll();
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
