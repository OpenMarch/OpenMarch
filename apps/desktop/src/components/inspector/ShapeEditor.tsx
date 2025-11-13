import { InspectorCollapsible } from "./InspectorCollapsible";
import { Button } from "@openmarch/ui";
import { MarcherShape } from "@/global/classes/canvasObjects/MarcherShape";
import { useCallback } from "react";
import * as Form from "@radix-ui/react-form";
import {
    SelectItem,
    Select,
    SelectContent,
    SelectTriggerCompact,
} from "@openmarch/ui";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import {
    SvgCommandEnum,
    SvgCommands,
    secondSegmentSvgCommands,
} from "@/global/classes/canvasObjects/SvgCommand";
import { T, useTolgee } from "@tolgee/react";
import { useSelectionStore } from "@/stores/SelectionStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    copyShapePageToPageMutationOptions,
    deleteShapePagesMutationOptions,
} from "@/hooks/queries";
import { useCanvasStore } from "@/stores/CanvasStore";
import { assert } from "@/utilities/utils";

// eslint-disable-next-line max-lines-per-function
export default function ShapeEditor() {
    const queryClient = useQueryClient();
    const { selectedShapePageIds, setSelectedShapePageIds } =
        useSelectionStore()!;
    // const { data: shapePages } = useQuery({
    //     ...allDatabaseShapePagesQueryOptions(),
    //     queryKey: [shapePageKeys.all(), { selectedShapePageIds }],
    //     select: (data) =>
    //         data.filter((shapePage) =>
    //             selectedShapePageIds.includes(shapePage.id),
    //         ),
    // });
    const { selectedPage } = useSelectedPage()!;
    const { mutate: copyShapePageToPage, isPending: isCopyingShapePageToPage } =
        useMutation(copyShapePageToPageMutationOptions(queryClient));

    const { t } = useTolgee();
    const { canvas } = useCanvasStore();
    const { mutate: deleteShapePage } = useMutation(
        deleteShapePagesMutationOptions(queryClient),
    );

    const getMarcherShapesByShapePageId: () => Map<number, MarcherShape> =
        useCallback(() => {
            const map = new Map<number, MarcherShape>();
            if (!canvas) return map;
            for (const marcherShape of canvas.marcherShapes) {
                map.set(marcherShape.shapePage.id, marcherShape);
            }
            return map;
            // Need to refetch
            // TODO - stop relying on the canvas to get the marcher shapes
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [canvas]);

    // const [shapeIsOnNextPage, setShapeIsOnNextPage] = useState<
    //     Map<number, boolean>
    // >(new Map());
    // const [shapeIsOnPreviousPage, setShapeIsOnPreviousPage] = useState<
    //     Map<number, boolean>
    // >(new Map());

    // useEffect(() => {
    //     if (!selectedPage || !selectedMarcherShapes) {
    //         setShapeIsOnNextPage(new Map());
    //         setShapeIsOnPreviousPage(new Map());
    //         return;
    //     }

    //     const shapeIsOnPage = (
    //         marcherShape: MarcherShape,
    //         pageId: number | null,
    //     ) => {
    //         if (pageId === null) return false;
    //         const page = pages.find((page) => page.id === pageId);
    //         if (!page) {
    //             console.error("Page not found with id", pageId);
    //             return false;
    //         }

    //         return shapePages.some((shapePage) => {
    //             return (
    //                 shapePage.shape_id === marcherShape.shapePage.shape_id &&
    //                 shapePage.page_id === page.id
    //             );
    //         });
    //     };

    //     const nextPageMap = new Map<number, boolean>();
    //     const previousPageMap = new Map<number, boolean>();
    //     for (const marcherShape of selectedMarcherShapes) {
    //         nextPageMap.set(
    //             marcherShape.shapePage.id,
    //             shapeIsOnPage(marcherShape, selectedPage.nextPageId),
    //         );
    //         previousPageMap.set(
    //             marcherShape.shapePage.id,
    //             shapeIsOnPage(marcherShape, selectedPage.previousPageId),
    //         );
    //     }
    // }, [pages, selectedMarcherShapes, selectedPage, shapePages]);

    const updateSegment = useCallback(
        ({
            shapePageId,
            index,
            newSvg,
        }: {
            shapePageId: number;
            index: number;
            newSvg: SvgCommandEnum;
        }) => {
            assert(canvas, "Canvas is not set");
            const marcherShape = canvas.marcherShapes.find(
                (marcherShape) => marcherShape.shapePage.id === shapePageId,
            );
            if (!marcherShape) {
                console.error("Marcher shape not found with id", shapePageId);
                return;
            }
            marcherShape.updateSegment({ index, newSvg });
        },
        [canvas],
    );

    const handleDeleteShape = useCallback(
        (marcherShape: MarcherShape) => {
            deleteShapePage(new Set([marcherShape.shapePage.id]));
            setSelectedShapePageIds([]);
        },
        [deleteShapePage, setSelectedShapePageIds],
    );

    // eslint-disable-next-line max-lines-per-function
    const singleShapeEditor = (marcherShape: MarcherShape) => {
        return (
            <Form.Root
                id={`${marcherShape.shapePage.id}-shapeForm`}
                className="flex flex-col gap-24"
            >
                <div className="flex flex-wrap gap-8">
                    {selectedPage && (
                        <>
                            <Button
                                disabled={
                                    selectedPage.previousPageId == null ||
                                    isCopyingShapePageToPage
                                }
                                onClick={() => {
                                    copyShapePageToPage({
                                        shapePageId: marcherShape.shapePage.id,
                                        targetPageId:
                                            selectedPage.previousPageId!,
                                    });
                                }}
                                className="min-h-0 w-fit"
                                type="button"
                                size="compact"
                                variant="secondary"
                                tooltipSide="top"
                                tooltipText={
                                    selectedPage.previousPageId === null
                                        ? t(
                                              "inspector.shape.errorNoPreviousPage",
                                          )
                                        : t(
                                              "inspector.shape.copyToPreviousPage",
                                          )
                                }
                            >
                                <T keyName="inspector.shape.copyToPreviousPageButton" />
                            </Button>
                            <Button
                                disabled={
                                    selectedPage.nextPageId === null ||
                                    isCopyingShapePageToPage
                                }
                                onClick={() => {
                                    copyShapePageToPage({
                                        shapePageId: marcherShape.shapePage.id,
                                        targetPageId: selectedPage.nextPageId!,
                                    });
                                }}
                                className="min-h-0 w-fit"
                                type="button"
                                size="compact"
                                variant="secondary"
                                tooltipText={
                                    selectedPage.nextPageId === null
                                        ? t("inspector.shape.errorNoNextPage")
                                        : t("inspector.shape.copyToNextPage")
                                }
                            >
                                <T keyName="inspector.shape.copyToNextPageButton" />
                            </Button>
                        </>
                    )}
                    <Button
                        onClick={() => {
                            handleDeleteShape(marcherShape);
                        }}
                        className="min-h-0 w-fit"
                        type="button"
                        size="compact"
                        variant="red"
                        tooltipText={t("inspector.shape.ungroupShapeTooltip")}
                    >
                        <T keyName="inspector.shape.ungroupShapeButton" />
                    </Button>
                </div>
                <div className="flex flex-col gap-16">
                    <h5 className="text-h5">
                        <T keyName="inspector.shape.segments.title" />
                    </h5>
                    {marcherShape.shapePath.points.map(
                        (point, index) =>
                            index > 0 && ( // do not render the first shape (move)
                                <div
                                    key={index}
                                    className="flex items-center justify-between"
                                >
                                    <p className="text-body text-text/80">
                                        {t("inspector.shape.segment", {
                                            index: index,
                                        })}
                                    </p>
                                    <Select
                                        required
                                        value={
                                            SvgCommands[point.command].command
                                        }
                                        onValueChange={(
                                            newSvg: SvgCommandEnum,
                                        ) =>
                                            updateSegment({
                                                shapePageId:
                                                    marcherShape.shapePage.id,
                                                index,
                                                newSvg,
                                            })
                                        }
                                    >
                                        <SelectTriggerCompact label={"Type"} />
                                        <SelectContent>
                                            {(index > 1
                                                ? Object.values(SvgCommands)
                                                : secondSegmentSvgCommands
                                            ).map((cmd) => {
                                                return (
                                                    <SelectItem
                                                        key={cmd.command}
                                                        value={cmd.command}
                                                    >
                                                        {
                                                            cmd.readableDescription
                                                        }
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ),
                    )}
                    <div className="flex flex-wrap gap-8">
                        <Button
                            onClick={() => {
                                marcherShape.addSegment();
                            }}
                            type="button"
                            size="compact"
                            variant="primary"
                            tooltipText={t("inspector.shape.addSegmentTooltip")}
                        >
                            <PlusIcon size={20} />{" "}
                            <T keyName="inspector.shape.addSegmentButton" />
                        </Button>

                        <Button
                            onClick={() => {
                                marcherShape.deleteSegment(
                                    marcherShape.shapePath.points.length - 1,
                                );
                            }}
                            className="min-h-0"
                            type="button"
                            size="compact"
                            content="icon"
                            variant="red"
                            disabled={
                                marcherShape.shapePath.points.length === 2
                            }
                            tooltipText={t(
                                "inspector.shape.deleteLastSegmentTooltip",
                            )}
                        >
                            <TrashIcon size={20} />
                        </Button>
                    </div>
                </div>
                <div className="flex flex-col gap-8">
                    <h5 className="text-h5">
                        {t("inspector.shape.marchersOnShape", {
                            marchersCount: marcherShape.canvasMarchers.length,
                        })}
                    </h5>
                    {marcherShape.canvasMarchers.length > 0 && (
                        <p className="text-sub text-text/80 max-h-64 overflow-y-auto font-mono">
                            {marcherShape.canvasMarchers
                                .map((cm) => cm.marcherObj.drill_number)
                                .join(", ")}
                        </p>
                    )}
                </div>
            </Form.Root>
        );
    };

    const marcherShapesByShapePageId = getMarcherShapesByShapePageId();
    return (
        selectedShapePageIds.length > 0 && (
            <InspectorCollapsible
                defaultOpen
                title={"Shape"}
                className="mt-12 flex flex-col gap-12 overflow-y-auto"
            >
                {selectedShapePageIds
                    .filter((shapePageId) =>
                        marcherShapesByShapePageId.has(shapePageId),
                    )
                    .map((shapePageId) => {
                        return (
                            <div
                                key={shapePageId}
                                className="flex flex-col gap-12"
                            >
                                {singleShapeEditor(
                                    marcherShapesByShapePageId.get(
                                        shapePageId,
                                    )!,
                                )}
                            </div>
                        );
                    })}
            </InspectorCollapsible>
        )
    );
}
