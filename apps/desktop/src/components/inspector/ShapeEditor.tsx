import { InspectorCollapsible } from "./InspectorCollapsible";
import { Button } from "@openmarch/ui";
import { useShapePageStore } from "@/stores/ShapePageStore";
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
import { toast } from "sonner";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjects } from "@/hooks";
import {
    SvgCommandEnum,
    SvgCommands,
    secondSegmentSvgCommands,
} from "@/global/classes/canvasObjects/SvgCommand";
import { T, useTolgee } from "@tolgee/react";

export default function ShapeEditor() {
    const { selectedMarcherShapes, setSelectedMarcherShapes } =
        useShapePageStore()!;
    const { pages } = useTimingObjects()!;
    const { selectedPage } = useSelectedPage()!;

    const { t } = useTolgee();

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
            const marcherShape = selectedMarcherShapes.find(
                (marcherShape) => marcherShape.shapePage.id === shapePageId,
            );
            if (!marcherShape) {
                console.error("Marcher shape not found with id", shapePageId);
                return;
            }
            marcherShape.updateSegment({ index, newSvg });
        },
        [selectedMarcherShapes],
    );

    const handleCopy = useCallback(
        async (marcherShape: MarcherShape, targetPageId: number) => {
            const page = pages.find((page) => page.id === targetPageId);

            if (!page) {
                const message = t("inspector.shape.errorPageNotFound", {
                    pageId: targetPageId,
                });
                console.error(message);
                toast.error(message);
                return;
            }

            const response = await MarcherShape.copyToPage(
                marcherShape,
                targetPageId,
            );

            if (response.success && response.data) {
                toast.success(
                    t("inspector.shape.successfullyCopied", {
                        pageName: page.name,
                    }),
                );
            } else {
                console.error(
                    `Error creating pages:`,
                    response.error?.message || "",
                );
                toast.error(
                    t("inspector.shape.errorCopyingPage", {
                        pageName: page.name,
                    }),
                );
            }
        },
        [pages, t],
    );
    const handleDeleteShape = useCallback(
        (marcherShape: MarcherShape) => {
            MarcherShape.deleteShapePage(marcherShape.shapePage.id);
            setSelectedMarcherShapes(
                selectedMarcherShapes.filter(
                    (shape) => shape.shapePage.id !== marcherShape.shapePage.id,
                ),
            );
        },
        [selectedMarcherShapes, setSelectedMarcherShapes],
    );

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
                                    selectedPage.previousPageId === null
                                    // ||
                                    // shapeIsOnPreviousPage.get(
                                    //     marcherShape.shapePage.id,
                                    // )
                                }
                                onClick={() => {
                                    handleCopy(
                                        marcherShape,
                                        selectedPage.previousPageId!,
                                    );
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
                                        : // : !shapeIsOnPreviousPage.get(
                                          //         marcherShape.shapePage.id,
                                          //     )
                                          t(
                                              "inspector.shape.copyToPreviousPage",
                                          )
                                    //   ?"Cannot copy. The previous page already has this shape"
                                }
                            >
                                <T keyName="inspector.shape.copyToPreviousPageButton" />
                            </Button>
                            <Button
                                disabled={
                                    selectedPage.nextPageId === null
                                    // ||
                                    // shapeIsOnNextPage.get(
                                    //     marcherShape.shapePage.id,
                                    // )
                                }
                                onClick={() => {
                                    handleCopy(
                                        marcherShape,
                                        selectedPage.nextPageId!,
                                    );
                                }}
                                className="min-h-0 w-fit"
                                type="button"
                                size="compact"
                                variant="secondary"
                                tooltipText={
                                    selectedPage.nextPageId === null
                                        ? t("inspector.shape.errorNoNextPage")
                                        : // : !shapeIsOnNextPage.get(
                                          //         marcherShape.shapePage.id,
                                          //     )
                                          t("inspector.shape.copyToNextPage")
                                    //   ?"Cannot copy. The next page already has this shape"
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

    return (
        selectedMarcherShapes.length > 0 && (
            <InspectorCollapsible
                defaultOpen
                title={"Shape"}
                className="mt-12 flex flex-col gap-12 overflow-y-auto"
            >
                {selectedMarcherShapes.map((marcherShape) => {
                    return (
                        <div
                            key={marcherShape.shapePage.id}
                            className="flex flex-col gap-12"
                        >
                            {singleShapeEditor(marcherShape)}
                        </div>
                    );
                })}
            </InspectorCollapsible>
        )
    );
}
