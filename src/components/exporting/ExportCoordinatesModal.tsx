import { useCallback, useState } from "react";
import MarcherCoordinateSheet, {
    StaticMarcherCoordinateSheet,
} from "./MarcherCoordinateSheet";
import ReactDOMServer from "react-dom/server";
import { useFieldProperties } from "@/context/fieldPropertiesContext";
import { useMarcherStore } from "@/stores/MarcherStore";
import { usePageStore } from "@/stores/PageStore";
import { useMarcherPageStore } from "@/stores/MarcherPageStore";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "../ui/Dialog";
import { ArrowSquareOut } from "@phosphor-icons/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipContents } from "../ui/Tooltip";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import * as Form from "@radix-ui/react-form";
import { Input } from "../ui/Input";

function ExportModalContents() {
    const [isTerse, setIsTerse] = useState(false);
    const [includeMeasures, setIncludeMeasures] = useState(true);
    const [useXY, setUseXY] = useState(false);
    const [roundingDenominator, setRoundingDenominator] = useState(4);
    const { marchers } = useMarcherStore()!;
    const { pages } = usePageStore()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { fieldProperties } = useFieldProperties()!;
    const [isLoading, setIsLoading] = useState(false);

    const handleExport = useCallback(() => {
        if (!fieldProperties)
            throw new Error("Field properties not found in context");

        const coordinateSheets: string[] = [];
        marchers.forEach((marcher) => {
            console.log("marcher", marcher);
            coordinateSheets.push(
                ReactDOMServer.renderToString(
                    <StaticMarcherCoordinateSheet
                        marcher={marcher}
                        pages={pages}
                        marcherPages={marcherPages}
                        includeMeasures={includeMeasures}
                        terse={isTerse}
                        useXY={useXY}
                        fieldProperties={fieldProperties}
                        roundingDenominator={roundingDenominator}
                    />,
                ),
            );
        });
        setIsLoading(true);
        window.electron
            .sendExportIndividualCoordinateSheets(coordinateSheets)
            .then(() => setIsLoading(false));
    }, [
        fieldProperties,
        marchers,
        pages,
        marcherPages,
        includeMeasures,
        isTerse,
        useXY,
        roundingDenominator,
    ]);

    return (
        <div className="flex flex-col gap-20">
            <Form.Root className="grid grid-cols-2 gap-y-24">
                <Form.Field
                    name="includeMeasures"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={includeMeasures}
                            onCheckedChange={(checked: boolean) =>
                                setIncludeMeasures(checked)
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        Include measures
                    </Form.Label>
                </Form.Field>
                <Form.Field
                    name="abbreviateCoordinateDescriptions"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={isTerse}
                            onCheckedChange={(checked: boolean) =>
                                setIsTerse(checked)
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        Abbreviate coordinate descriptions
                    </Form.Label>
                </Form.Field>
                <Form.Field
                    name="useXYHeaders"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={useXY}
                            onCheckedChange={(checked: boolean) =>
                                setUseXY(checked)
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        Use X/Y headers
                    </Form.Label>
                </Form.Field>
                <Form.Field
                    name="roundingDenominator"
                    className="flex w-full items-center justify-between gap-12"
                >
                    <Form.Label className="text-body">
                        Rounding denominator:
                    </Form.Label>
                    <Form.Control asChild className="w-[6rem]">
                        <Input
                            type="number"
                            className="w-fit"
                            defaultValue={roundingDenominator}
                            step={1}
                            min={1}
                            onChange={(e) =>
                                setRoundingDenominator(
                                    parseInt(e.target.value) || 4,
                                )
                            }
                        />
                    </Form.Control>
                </Form.Field>
            </Form.Root>
            <div className="flex flex-col gap-8">
                <div className="flex w-full items-center justify-between">
                    <h5 className="text-h5">Preview</h5>
                    <p className="text-sub text-text/75">
                        {"4 -> 1/4 = nearest quarter step"}
                        {" | "}
                        {"10 -> 1/10 = nearest tenth step"}
                    </p>
                </div>
                <div>
                    <div className="mx-2 bg-white text-black">
                        <MarcherCoordinateSheet
                            example={true}
                            terse={isTerse}
                            includeMeasures={includeMeasures}
                            useXY={useXY}
                            roundingDenominator={roundingDenominator || 4}
                        />
                    </div>
                </div>
            </div>
            <div className="flex w-full justify-end gap-8">
                <Button
                    size="compact"
                    onClick={handleExport}
                    disabled={isLoading}
                >
                    {isLoading ? "Exporting... Please wait" : "Export"}
                </Button>
                <DialogClose>
                    <Button size="compact" variant="secondary">
                        Cancel
                    </Button>
                </DialogClose>
            </div>
        </div>
    );
}

export default function ExportCoordinatesModal() {
    return (
        <Dialog>
            <Tooltip.Root>
                <Tooltip.Trigger asChild>
                    <DialogTrigger className="cursor-pointer outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50">
                        <ArrowSquareOut size={18} />
                    </DialogTrigger>
                </Tooltip.Trigger>
                <TooltipContents>
                    Export individual coordinate sheets for marchers
                </TooltipContents>
            </Tooltip.Root>
            <DialogContent className="w-[48rem]">
                <DialogTitle>Export Individual Coordinate Sheets</DialogTitle>
                <ExportModalContents />
            </DialogContent>
        </Dialog>
    );
}
