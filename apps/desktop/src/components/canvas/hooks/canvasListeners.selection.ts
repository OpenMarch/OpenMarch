import { useEffect, useCallback } from "react";
import * as Selectable from "@/global/classes/canvasObjects/interfaces/Selectable";
import CanvasMarcher from "@/global/classes/canvasObjects/CanvasMarcher";
import Marcher from "@/global/classes/Marcher";
import OpenMarchCanvas from "@/global/classes/canvasObjects/OpenMarchCanvas";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useQuery } from "@tanstack/react-query";
import { marcherPagesByPageQueryOptions } from "@/hooks/queries";
import { useSelectionStore } from "@/stores/SelectionStore";
import { useSelectedPage } from "@/context/SelectedPageContext";

// eslint-disable-next-line max-lines-per-function
export const useSelectionListeners = ({
    canvas,
}: {
    canvas: OpenMarchCanvas | null;
}) => {
    const { selectedShapePageIds } = useSelectionStore()!;
    const { selectedPage } = useSelectedPage()!;
    const { setSelectedShapePageIds } = useSelectionStore();
    const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
    const unimplementedError = (
        selectableClass: Selectable.SelectableClasses,
    ) => {
        throw new Error(
            `Invalid selectable class "${selectableClass}". Have you implemented all of the cases in Canvas.tsx for each selectable item on the canvas?`,
        );
    };
    const { data: marcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );

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
                        setSelectedShapePageIds(
                            marcherShapesToSelect.map((ms) => ms.shapePage.id),
                        );
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
        setSelectedMarchers,
        setSelectedShapePageIds,
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
        setSelectedShapePageIds([]);
    }, [setSelectedMarchers, setSelectedShapePageIds]);

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
        selectedMarchers,
        marcherPages,
        selectedPage,
        canvas,
        setSelectedMarchers,
        getGlobalSelectedObjectClassIds,
        activeObjectsAreGloballySelected,
    ]);

    // Update the control points on MarcherShapes when the selectedShapePages change
    useEffect(() => {
        if (canvas && selectedShapePageIds) {
            // Disable control of all of the non-selected shape pages and enable control of selected ones
            const selectedIdSet = new Set(selectedShapePageIds);
            for (const marcherShape of canvas.marcherShapes) {
                if (selectedIdSet.has(marcherShape.shapePage.id)) {
                    marcherShape.enableControl();
                } else {
                    marcherShape.disableControl();
                }
            }
        }
    }, [canvas, selectedShapePageIds]);

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
};
