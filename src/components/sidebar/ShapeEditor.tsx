import { SidebarCollapsible } from "./SidebarCollapsible";
import { Button } from "../ui/Button";
import { useShapePageStore } from "@/stores/ShapePageStore";
import { MarcherShape } from "@/global/classes/canvasObjects/MarcherShape";
import { useCallback } from "react";
import * as Form from "@radix-ui/react-form";
import {
    SelectItem,
    Select,
    SelectContent,
    SelectTriggerCompact,
} from "../ui/Select";
import {
    secondSegmentSvgCommands,
    SvgCommandEnum,
    SvgCommands,
} from "@/global/classes/canvasObjects/StaticMarcherShape";
import { Plus, Trash } from "@phosphor-icons/react";

export default function ShapeEditor() {
    const { selectedMarcherShapes } = useShapePageStore()!;

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
            // console.log("updateSegment", { shapePageId, index, newSvg });
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

    const singleShapeEditor = (marcherShape: MarcherShape) => {
        return (
            <Form.Root
                id={`${marcherShape.shapePage.id}-shapeForm`}
                className="flex flex-col gap-12"
            >
                <div className="flex flex-col gap-12">
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
                        <p className="max-h-64 overflow-y-auto font-mono text-sub text-text/80">
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
