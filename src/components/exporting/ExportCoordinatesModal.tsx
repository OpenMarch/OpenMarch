import { useCallback, useEffect, useState } from "react";
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
import { ArrowSquareOut, Info } from "@phosphor-icons/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { TooltipContents } from "../ui/Tooltip";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import * as Form from "@radix-ui/react-form";
import { Input } from "../ui/Input";
import { toast } from "react-toastify";
import { useTranslation } from "react-i18next";

function ExportModalContents() {
    const [isTerse, setIsTerse] = useState(false);
    const [includeMeasures, setIncludeMeasures] = useState(true);
    const [useXY, setUseXY] = useState(false);
    const [roundingDenominator, setRoundingDenominator] = useState(4);
    const [organizeBySection, setOrganizeBySection] = useState(false);
    const { marchers } = useMarcherStore()!;
    const { pages } = usePageStore()!;
    const { marcherPages } = useMarcherPageStore()!;
    const { fieldProperties } = useFieldProperties()!;
    const [isLoading, setIsLoading] = useState(false);
    const [, setProgress] = useState(0);
    const { t } = useTranslation();

    // Debug logging
    useEffect(() => {
        console.log("Marchers:", marchers);
        console.log(
            "Detailed Marcher Info:",
            marchers.map((m) => ({
                name: m.name,
                section: m.section,
                id: m.id,
            })),
        );
    }, [marchers]);

    useEffect(() => {
        if (isLoading) {
            const interval = setInterval(() => {
                setProgress((prevProgress) => {
                    if (prevProgress >= 100) {
                        clearInterval(interval);
                        setIsLoading(false);
                        toast.success(
                            t("exportCoordinatesModal.toast.exportComplete"),
                        );
                        return 100;
                    }
                    return prevProgress + 10;
                });
            }, 500);
        }
    }, [isLoading, t]);

    const handleExport = useCallback(async () => {
        setIsLoading(true);
        setProgress(0);

        if (!fieldProperties) {
            toast.error(t("exportCoordinatesModal.toast.noFieldProperties"));
            setIsLoading(false);
            return;
        }

        try {
            const processedMarchers = marchers.map((marcher, index) => ({
                ...marcher,
                name: marcher.name || `${marcher.section} ${index + 1}`,
            }));

            const coordinateSheets = processedMarchers.map((marcher) => ({
                name: marcher.name,
                drillNumber: marcher.drill_number,
                section:
                    marcher.section ||
                    t("exportCoordinatesModal.unsortedSection"),
                renderedPage: ReactDOMServer.renderToString(
                    <StaticMarcherCoordinateSheet
                        marcher={marcher}
                        pages={pages}
                        marcherPages={marcherPages}
                        fieldProperties={fieldProperties}
                        includeMeasures={includeMeasures}
                        terse={isTerse}
                        useXY={useXY}
                        roundingDenominator={roundingDenominator}
                    />,
                ),
            }));

            const result = await window.electron.export.pdf({
                sheets: coordinateSheets,
                organizeBySection,
            });

            if (!result.success) {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error("Export failed:", error);
            toast.error(
                t("exportCoordinatesModal.toast.exportFailed", {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                }),
            );
        } finally {
            setIsLoading(false);
            setProgress(100);
        }
    }, [
        fieldProperties,
        marchers,
        pages,
        marcherPages,
        includeMeasures,
        isTerse,
        useXY,
        roundingDenominator,
        organizeBySection,
        t,
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
                        {" "}
                        {t("exportCoordinatesModal.form.includeMeasures") + " "}
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
                        {" "}
                        {t(
                            "exportCoordinatesModal.form.abbreviateCoordinateDescriptions",
                        ) + " "}
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
                        {" "}
                        {t("exportCoordinatesModal.form.useXYHeaders") + " "}
                    </Form.Label>
                </Form.Field>
                <Form.Field
                    name="roundingDenominator"
                    className="flex w-full items-center justify-between gap-12"
                >
                    <Form.Label className="text-body">
                        {" "}
                        {t("exportCoordinatesModal.form.roundingDenominator") +
                            " "}
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
                <Form.Field
                    name="organizeBySection"
                    className="flex w-full items-center gap-12"
                >
                    <Form.Control asChild>
                        <Checkbox
                            checked={organizeBySection}
                            onCheckedChange={(checked: boolean) =>
                                setOrganizeBySection(checked)
                            }
                        />
                    </Form.Control>
                    <Form.Label className="text-body">
                        {" "}
                        {t("exportCoordinatesModal.form.organizeBySection") +
                            " "}
                    </Form.Label>

                    <Tooltip.TooltipProvider>
                        <Tooltip.Root>
                            <Tooltip.Trigger type="button">
                                <Info size={18} className="text-text/60" />
                            </Tooltip.Trigger>
                            <TooltipContents className="p-16">
                                <div>
                                    {t(
                                        "exportCoordinatesModal.form.individualPDFs.label",
                                    )}
                                </div>
                                <div>
                                    {t(
                                        "exportCoordinatesModal.form.individualPDFs.description",
                                    )}
                                </div>
                            </TooltipContents>
                        </Tooltip.Root>
                    </Tooltip.TooltipProvider>
                </Form.Field>
            </Form.Root>

            {/* Preview Section */}
            <div className="flex flex-col gap-8">
                <div className="flex w-full items-center justify-between">
                    <h5 className="text-h5">
                        {t("exportCoordinatesModal.preview.label")}
                    </h5>
                    <p className="text-sub text-text/75">
                        {t("exportCoordinatesModal.preview.subtext")}
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

            {/* Export Button */}
            <div className="flex w-full justify-end gap-8">
                <Button
                    size="compact"
                    onClick={handleExport}
                    disabled={isLoading || marchers.length === 0}
                >
                    {isLoading
                        ? t("exportCoordinatesModal.submit.loading")
                        : t("exportCoordinatesModal.submit.label")}
                </Button>
                <DialogClose>
                    <Button size="compact" variant="secondary">
                        {" "}
                        {t("exportCoordinatesModal.submit.cancel") + " "}
                    </Button>
                </DialogClose>
            </div>
        </div>
    );
}

export default function ExportCoordinatesModal() {
    const { t } = useTranslation();
    return (
        <Dialog>
            <DialogTrigger
                asChild
                className="cursor-pointer outline-none duration-150 ease-out hover:text-accent focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-50"
            >
                <ArrowSquareOut size={18} />
            </DialogTrigger>

            {/* Dialog Setup */}
            <DialogContent className="w-[48rem]">
                <DialogTitle>{t("exportCoordinatesModal.label")}</DialogTitle>
                <ExportModalContents />
            </DialogContent>
        </Dialog>
    );
}
