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
    SelectTriggerButton,
} from "../ui/Select";
import {
    secondSegmentSvgCommands,
    SvgCommandEnum,
    SvgCommands,
} from "@/global/classes/canvasObjects/StaticMarcherShape";

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
                className="flex flex-col gap-2"
            >
                {marcherShape.canvasMarchers.length > 0 && (
                    <div className="">
                        {marcherShape.canvasMarchers.length} Marchers:{" "}
                        <p className="max-h-64 overflow-y-auto text-sub">
                            {marcherShape.canvasMarchers
                                .map((cm) => cm.marcherObj.drill_number)
                                .join(", ")}
                        </p>
                    </div>
                )}
                {marcherShape.shapePath.points.map(
                    (point, index) =>
                        index > 0 && ( // do not render the first shape (move)
                            <Form.Field
                                key={index}
                                name="section"
                                className="flex items-center justify-between"
                            >
                                <Form.Label className="text-body text-text/80">
                                    Segment {index}
                                </Form.Label>

                                <Form.Control asChild>
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
                                        <SelectTriggerButton label={"Type"} />
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
                                </Form.Control>
                                <Form.Message
                                    match={"valueMissing"}
                                    className="text-sub leading-none text-red"
                                >
                                    Please enter a value.
                                </Form.Message>
                            </Form.Field>
                        ),
                )}
                <Button
                    onClick={() => {
                        marcherShape.addSegment();
                    }}
                    type="button"
                >
                    Add Segment
                </Button>
                <Button
                    onClick={() => {
                        marcherShape.deleteSegment(
                            marcherShape.shapePath.points.length - 1,
                        );
                    }}
                    type="button"
                >
                    Delete Segment
                </Button>
            </Form.Root>
        );
    };

    return (
        selectedMarcherShapes.length > 0 && (
            <SidebarCollapsible
                defaultOpen
                title={"Shapes"}
                className="max-h-100 mt-12 flex flex-col gap-12 overflow-y-auto"
            >
                {selectedMarcherShapes.map((marcherShape) => {
                    return (
                        <div
                            key={marcherShape.shapePage.id}
                            className="flex flex-col gap-2"
                        >
                            {singleShapeEditor(marcherShape)}
                        </div>
                    );
                })}
            </SidebarCollapsible>
        )
    );
}
