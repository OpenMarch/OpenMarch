import { db } from "@/global/database/db";
import { toOpenMarchTempoData } from "./utils/dots-to-omt";
import { useState } from "react";
import { Button, DialogClose } from "@openmarch/ui";
import { T, useTolgee } from "@tolgee/react";
import { toast } from "sonner";

export default function TempoExport() {
    const [isLoading, setIsLoading] = useState(false);
    const { t } = useTolgee();

    const handleExport = async () => {
        setIsLoading(true);
        try {
            const omt = await toOpenMarchTempoData(db);
            const jsonStr = JSON.stringify(omt, null, 2);

            if (
                typeof window !== "undefined" &&
                window.electron?.export?.saveOmt
            ) {
                const result = await window.electron.export.saveOmt(jsonStr);
                if (result.success) {
                    toast.success(t("exportModal.tempoExportSuccess"));
                } else if (!result.cancelled && result.error) {
                    toast.error(
                        t("exportModal.exportFailedToast", {
                            error: result.error,
                        }),
                    );
                }
            } else {
                const blob = new Blob([jsonStr], {
                    type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "tempo.omt";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                toast.success(t("exportModal.tempoExportSuccess"));
            }
        } catch (error) {
            toast.error(
                t("exportModal.exportFailedToast", {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                }),
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-16">
            {/* Preview Section */}
            <div className="flex flex-col gap-8">
                <T keyName="exportModal.tempoExportDescription" />
            </div>

            {/* Export Button */}
            <div className="flex w-full justify-end gap-8">
                <Button
                    size="compact"
                    onClick={handleExport}
                    disabled={isLoading}
                >
                    {isLoading
                        ? t("exportModal.exporting")
                        : t("exportModal.export")}
                </Button>
                <DialogClose>
                    <Button size="compact" variant="secondary">
                        <T keyName="exportModal.cancel" />
                    </Button>
                </DialogClose>
            </div>
        </div>
    );
}
