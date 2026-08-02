import { useCallback, useEffect, useState } from "react";
import {
    ArrowSquareOutIcon,
    CircleNotchIcon,
    WarningCircleIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@openmarch/ui";
import {
    buildIlluminantExportSource,
    checkIlluminantHealth,
    exportIlluminantShow,
} from "./illuminantApiExport";

type HealthState = "checking" | "ok" | "error";

const EXPORT_INSTRUCTIONS = [
    "Finish laying out your lighting scenes and effects in the Light Designer.",
    "Double-check that every marcher is assigned to the correct lighting group.",
    'Click "Export lighting data" below to generate your Illuminant file.',
];

export default function IlluminantExportTab() {
    const [healthState, setHealthState] = useState<HealthState>("checking");
    const [isExporting, setIsExporting] = useState(false);

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

    const handleExport = useCallback(async () => {
        setIsExporting(true);
        try {
            const request = await buildIlluminantExportSource();
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
    }, []);

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
