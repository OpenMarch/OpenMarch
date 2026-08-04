import { useCallback, useEffect, useState } from "react";
import {
    ArrowSquareOutIcon,
    CircleNotchIcon,
    WarningCircleIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import {
    buildIlluminantExportSource,
    checkIlluminantHealth,
    DEFAULT_SHOW_COLOR,
    exportIlluminantShow,
    getShowColorLabel,
    SHOW_COLOR_HEX,
    SHOW_COLORS,
    type ShowColor,
} from "./illuminantApiExport";

type HealthState = "checking" | "ok" | "error";

const EXPORT_INSTRUCTIONS = [
    "Choose a Show Color. This will be the color that shows up on your Illuminant light when this show is selected.",
    "Export this lighting file with the button below.",
    "Import the resulting file into the illuminant app.",
];

function ShowColorOption({ color }: { color: ShowColor }) {
    return (
        <span className="flex items-center gap-8">
            <span
                className="border-stroke size-12 shrink-0 rounded-full border"
                style={{ backgroundColor: SHOW_COLOR_HEX[color] }}
            />
            {getShowColorLabel(color)}
        </span>
    );
}

export default function IlluminantExportTab() {
    const [healthState, setHealthState] = useState<HealthState>("checking");
    const [isExporting, setIsExporting] = useState(false);
    const [showColor, setShowColor] = useState<ShowColor>(DEFAULT_SHOW_COLOR);
    const [title, setTitle] = useState("");

    useEffect(() => {
        let cancelled = false;
        setHealthState("checking");
        void checkIlluminantHealth().then((result) => {
            if (cancelled) return;
            setHealthState(result.ok ? "ok" : "error");
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        void window.electron.databaseGetPath().then((path) => {
            if (cancelled || !path) return;
            const filename = path.split(/[/\\]/).filter(Boolean).pop() ?? "";
            const derived = filename.replace(/\.dots$/i, "");
            setTitle((prev) => (prev ? prev : derived));
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleExport = useCallback(async () => {
        setIsExporting(true);
        try {
            const request = await buildIlluminantExportSource({
                showColor,
                title: title.trim() || "Untitled",
            });
            const result = await exportIlluminantShow(request);

            if (!result.success) {
                if ("canceled" in result) return;
                throw new Error(result.error);
            }

            toast.success(
                <span>
                    Illuminant export complete
                    <button
                        type="button"
                        onClick={async () => {
                            const error =
                                await window.electron.openExportDirectory(
                                    result.exportDir,
                                );
                            if (error) {
                                toast.error(
                                    `Could not open export directory: ${error}`,
                                );
                            }
                        }}
                        className="text-accent ml-8 underline"
                    >
                        Click to view folder
                    </button>
                </span>,
            );
        } catch (error) {
            toast.error("Illuminant export failed", {
                description:
                    error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsExporting(false);
        }
    }, [showColor, title]);

    if (healthState === "checking") {
        return (
            <div className="text-text-subtitle flex min-h-[16rem] flex-col items-center justify-center gap-12 text-center">
                <CircleNotchIcon size={32} className="animate-spin" />
                <p className="text-body">Checking lighting export service…</p>
            </div>
        );
    }

    if (healthState === "error") {
        return (
            <div className="flex min-h-[16rem] flex-col items-center justify-center gap-16 text-center">
                <div className="text-red flex flex-col items-center gap-8">
                    <WarningCircleIcon size={40} />
                    <h4 className="text-h4 leading-none">
                        Lighting export is unavailable
                    </h4>
                </div>
                <p className="text-body text-text-subtitle max-w-md">
                    We couldn&apos;t reach the lighting export service. Please
                    reach out to support.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-16">
            <ol className="text-body flex list-decimal flex-col gap-8 pl-20">
                {EXPORT_INSTRUCTIONS.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                ))}
            </ol>

            <div className="flex w-full items-center gap-12">
                <span className="text-body">Title</span>
                <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-[16rem]"
                    placeholder="Show title"
                />
            </div>

            <div className="flex w-full items-center gap-12">
                <span className="text-body">Show color</span>
                <Select
                    value={showColor}
                    onValueChange={(value: string) =>
                        setShowColor(value as ShowColor)
                    }
                >
                    <SelectTriggerButton
                        label={getShowColorLabel(showColor)}
                        className="w-[16rem] whitespace-nowrap"
                    />
                    <SelectContent>
                        {SHOW_COLORS.map((color) => (
                            <SelectItem key={color} value={color}>
                                <ShowColorOption color={color} />
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="flex w-full justify-end">
                <Button
                    size="compact"
                    onClick={() => void handleExport()}
                    disabled={isExporting}
                >
                    <ArrowSquareOutIcon size={16} />
                    {isExporting ? "Exporting…" : "Export lighting data"}
                </Button>
            </div>
        </div>
    );
}
