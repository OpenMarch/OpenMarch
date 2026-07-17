import { Button } from "@openmarch/ui";
import { T, useTranslate } from "@tolgee/react";
import { FileArrowUpIcon, FilePlusIcon } from "@phosphor-icons/react";
import type { NewShowStartData } from "../../newShowTypes";

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
            <Button
                type="button"
                variant={selectedMode === "blank" ? "primary" : "secondary"}
                className="h-auto justify-start gap-12 p-16 text-left"
                onClick={onStartBlank}
                disabled={isImporting}
            >
                <FilePlusIcon size={28} />
                <span className="flex flex-col gap-4">
                    <span className="text-body font-medium">
                        <T keyName="launchpage.newShow.steps.start.blank" />
                    </span>
                    <span className="text-text/70 text-sm font-normal">
                        <T keyName="launchpage.newShow.steps.start.blankDescription" />
                    </span>
                </span>
            </Button>
            <Button
                type="button"
                variant={
                    selectedMode === "importPrevious" ? "primary" : "secondary"
                }
                className="h-auto justify-start gap-12 p-16 text-left"
                onClick={onImportPrevious}
                disabled={isImporting}
            >
                <FileArrowUpIcon size={28} />
                <span className="flex flex-col gap-4">
                    <span className="text-body font-medium">
                        <T keyName="launchpage.newShow.steps.start.importPrevious" />
                    </span>
                    <span className="text-text/70 text-sm font-normal">
                        {sourceName
                            ? t(
                                  "launchpage.newShow.steps.start.importSummary",
                                  {
                                      fileName: sourceName,
                                      count: importedPerformerCount ?? 0,
                                  },
                              )
                            : t(
                                  "launchpage.newShow.steps.start.importPreviousDescription",
                              )}
                    </span>
                </span>
            </Button>
        </div>
    );
}
