import { SidebarCollapsible } from "./SidebarCollapsible";
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
import {
    secondSegmentSvgCommands,
    SvgCommandEnum,
    SvgCommands,
} from "@/global/classes/canvasObjects/StaticMarcherShape";
import { Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useTimingObjectsStore } from "@/stores/TimingObjectsStore";

export default function ShapeEditor() {
    const { selectedMarcherShapes, setSelectedMarcherShapes } =
        useShapePageStore()!;
    const { pages } = useTimingObjectsStore()!;
    const { selectedPage } = useSelectedPage()!;

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
                const message = `Page not found with id ${targetPageId}`;
                console.error(message);
                toast.error(message);
                return;
            }

            const response = await MarcherShape.copyToPage(
                marcherShape,
                targetPageId,
            );

            if (response.success && response.data) {
                toast.success(`Shape successfully copied to page ${page.name}`);
            } else {
                console.error(
                    `Error creating pages:`,
                    response.error?.message || "",
                );
                toast.error(
                    `Error copying to page ${page.name}. Are there marchers already assigned to shapes?`,
                );
            }
        },
        [pages],
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
                                        ? "Cannot copy. There is no previous page"
                                        : // : !shapeIsOnPreviousPage.get(
                                          //         marcherShape.shapePage.id,
                                          //     )
                                          "Copy this shape to the previous page"
                                    //   ?"Cannot copy. The previous page already has this shape"
                                }
                            >
                                Copy to prev pg
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
                                        ? "Cannot copy. There is no next page"
                                        : // : !shapeIsOnNextPage.get(
                                          //         marcherShape.shapePage.id,
                                          //     )
                                          "Copy this shape to the next page"
                                    //   ?"Cannot copy. The next page already has this shape"
                                }
                            >
                                Copy to next pg
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
                        tooltipText="Delete this shape for this page. Will not move marchers from their current position"
                    >
                        Un-group
                    </Button>
                </div>
                <div className="flex flex-col gap-16">
                    <h5 className="text-h5">Segments</h5>
                    {marcherShape.shapePath.points.map(
                        (point, index) =>
                            index > 0 && ( // do not render the first shape (move)
                                <div
                                    key={index}
                                    className="flex items-center justify-between"
                                >
                                    <p className="text-body text-text/80">
                                        Segment {index}
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
                            tooltipText="Add segment to shape"
                        >
                            <Plus size={20} /> Add
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
                            tooltipText="Delete last segment"
                        >
                            <Trash size={20} />
                        </Button>
                    </div>
                </div>
                <div className="flex flex-col gap-8">
                    <h5 className="text-h5">
                        {marcherShape.canvasMarchers.length} Marchers
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
            <SidebarCollapsible
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
            </SidebarCollapsible>
        )
    );
}
