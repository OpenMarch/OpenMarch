import { Button } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import {
    DownloadSimpleIcon,
    FileArrowUpIcon,
    FileIcon,
    FilePlusIcon,
} from "@phosphor-icons/react";
import type { NewShowStartData } from "../../newShowTypes";
import clsx from "clsx";

interface StartStepProps {
    start: NewShowStartData | null;
    importedSourcePath?: string;
    importedPerformerCount?: number;
    onStartBlank: () => void;
    onImportPrevious: () => void;
    isImporting?: boolean;
}

export default function StartStep({
    start,
    importedSourcePath,
    importedPerformerCount,
    onStartBlank,
    onImportPrevious,
    isImporting = false,
}: StartStepProps) {
    const { t } = useTranslate();
    const selectedMode = start?.mode;
    const sourceName = importedSourcePath?.split(/[\\/]/).pop();

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-12">
            <div
                tabIndex={isImporting ? -1 : 0}
                className={clsx(
                    "rounded-6 h-auto justify-start gap-12 border p-16 text-left",
                    selectedMode === "blank"
                        ? "bg-accent/20 border-accent"
                        : "bg-fg-2 border-stroke",
                    isImporting
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer",
                )}
                onClick={isImporting ? undefined : onStartBlank}
            >
                <span className="flex items-center gap-8">
                    <FileIcon size={28} />
                    <span className="text-lg font-bold">
                        <T keyName="launchpage.newShow.steps.start.blank" />
                    </span>
                </span>
                <span className="text-text/70 text-sm font-normal">
                    <T keyName="launchpage.newShow.steps.start.blankDescription" />
                </span>
            </div>
            <div
                tabIndex={isImporting ? -1 : 0}
                className={clsx(
                    "rounded-6 h-auto justify-start gap-12 border p-16 text-left",
                    selectedMode === "importPrevious"
                        ? "bg-accent/20 border-accent"
                        : "bg-fg-2 border-stroke",
                    isImporting
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer",
                )}
                onClick={isImporting ? undefined : onImportPrevious}
            >
                <span className="flex items-center gap-8">
                    <DownloadSimpleIcon size={28} />
                    <span className="text-lg font-bold">
                        <T keyName="launchpage.newShow.steps.start.importPrevious" />
                    </span>
                </span>
                <span className="text-text/70 text-sm font-normal">
                    {sourceName
                        ? t("launchpage.newShow.steps.start.importSummary", {
                              fileName: sourceName,
                              count: importedPerformerCount ?? 0,
                          })
                        : t(
                              "launchpage.newShow.steps.start.importPreviousDescription",
                          )}
                </span>
            </div>
        </div>
    );
}
