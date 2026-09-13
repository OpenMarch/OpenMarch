import { T, useTranslate } from "@tolgee/react";
import {
    CheckCircleIcon,
    CircleIcon,
    DownloadSimpleIcon,
    FileArrowUpIcon,
    FileIcon,
    FolderOpenIcon,
    SpinnerIcon,
    WarningIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Badge, Button, DangerNote, Input, WarningNote } from "@openmarch/ui";
import { WizardFormField } from "@/components/ui/FormField";
import type { NewShowStartData } from "../../newShowTypes";
import {
    ensureFileLocationHasProjectName,
    isPathUnderDirectory,
    resolveDefaultSaveDirectory,
    sanitizeFilename,
} from "../../newShowCompletion";
import {
    DRILL_IMPORT_STEPS,
    DRILL_IMPORT_STEP_LABELS,
    type DrillImportResult,
    type DrillImportStep,
} from "@/components/import/DrillImport";
import clsx from "clsx";

/**
 * Drives the "Import .3dz file" sub-flow, all within this single wizard step.
 * `result` is null while the import is running (progress checklist) and set
 * once it succeeds (review-and-save form).
 */
export interface DrillImportStartState {
    activeStep: DrillImportStep | null;
    result: DrillImportResult | null;
    isSaving: boolean;
    onSave: (projectName: string, fileLocation: string) => void;
}

interface StartStepProps {
    start: NewShowStartData | null;
    importedSourcePath?: string;
    importedPerformerCount?: number;
    onStartBlank: () => void;
    onImportPrevious: () => void;
    onImportDrillFile: (file: File) => void;
    isImporting?: boolean;
    newShowDraftsDirectory?: string;
    drillImport?: DrillImportStartState | null;
}

export default function StartStep({
    start,
    importedSourcePath,
    importedPerformerCount,
    onStartBlank,
    onImportPrevious,
    onImportDrillFile,
    isImporting = false,
    newShowDraftsDirectory = "",
    drillImport = null,
}: StartStepProps) {
    const { t } = useTranslate();
    const selectedMode = start?.mode;
    const sourceName = importedSourcePath?.split(/[\\/]/).pop();
    const drillFileInputRef = useRef<HTMLInputElement>(null);

    const handleCardKeyDown = (event: KeyboardEvent, onSelect: () => void) => {
        if (isImporting) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
        }
    };

    const handleDrillFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (drillFileInputRef.current) drillFileInputRef.current.value = "";
        if (file) onImportDrillFile(file);
    };

    if (drillImport) {
        return (
            <DrillImportProgressAndReview
                state={drillImport}
                newShowDraftsDirectory={newShowDraftsDirectory}
                defaultProjectName={
                    drillImport.result?.title
                        ? sanitizeFilename(
                              drillImport.result.title.replace(/\.3dj$/i, ""),
                          )
                        : ""
                }
            />
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-12">
            <div
                role="button"
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
                onKeyDown={(e) => handleCardKeyDown(e, onStartBlank)}
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
                role="button"
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
                onKeyDown={(e) => handleCardKeyDown(e, onImportPrevious)}
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
            <div
                role="button"
                tabIndex={isImporting ? -1 : 0}
                className={clsx(
                    "rounded-6 h-auto justify-start gap-12 border p-16 text-left",
                    selectedMode === "importDrill"
                        ? "bg-accent/20 border-accent"
                        : "bg-fg-2 border-stroke",
                    isImporting
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer",
                )}
                onClick={
                    isImporting
                        ? undefined
                        : () => drillFileInputRef.current?.click()
                }
                onKeyDown={(e) =>
                    handleCardKeyDown(e, () =>
                        drillFileInputRef.current?.click(),
                    )
                }
            >
                <input
                    ref={drillFileInputRef}
                    type="file"
                    accept=".3dz"
                    className="hidden"
                    onChange={handleDrillFileChange}
                />
                <span className="flex items-center gap-8">
                    <FileArrowUpIcon size={28} />
                    <span className="text-lg font-bold">
                        <T keyName="launchpage.newShow.steps.start.importDrill" />
                    </span>
                    <Badge variant="secondary">
                        <T keyName="launchpage.newShow.steps.start.importDrillBeta" />
                    </Badge>
                </span>
                <span className="text-text/70 text-sm font-normal">
                    <T keyName="launchpage.newShow.steps.start.importDrillDescription" />
                </span>
            </div>
        </div>
    );
}

function DrillStepIcon({ state }: { state: "done" | "active" | "pending" }) {
    if (state === "done")
        return (
            <CheckCircleIcon weight="fill" className="text-green" size={20} />
        );
    if (state === "active")
        return <SpinnerIcon className="text-accent animate-spin" size={20} />;
    return <CircleIcon className="text-text-subtitle" size={20} />;
}

function DrillImportProgressAndReview({
    state,
    defaultProjectName,
    newShowDraftsDirectory,
}: {
    state: DrillImportStartState;
    defaultProjectName: string;
    newShowDraftsDirectory: string;
}) {
    const { t } = useTranslate();
    const { activeStep, result, isSaving, onSave } = state;
    const isDone = result !== null;
    const total = DRILL_IMPORT_STEPS.length;
    const activeIndex = activeStep ? DRILL_IMPORT_STEPS.indexOf(activeStep) : 0;
    const fraction = isDone ? 1 : Math.min(1, (activeIndex + 0.5) / total);

    const [projectName, setProjectName] = useState(defaultProjectName);
    const [fileLocation, setFileLocation] = useState("");
    const [defaultDirectory, setDefaultDirectory] = useState("");
    const [fileExists, setFileExists] = useState(false);
    const fileLocationManuallyEdited = useRef(false);
    const isDraftsLocation = isPathUnderDirectory(
        fileLocation,
        newShowDraftsDirectory,
    );

    useEffect(() => {
        if (defaultProjectName) {
            setProjectName(defaultProjectName);
        }
    }, [defaultProjectName]);

    useEffect(() => {
        const fetchDefaultDirectory = async () => {
            try {
                const lastFilePath = await window.electron.databaseGetPath();
                const docsPath =
                    await window.electron.getDefaultDocumentsPath();
                setDefaultDirectory(
                    resolveDefaultSaveDirectory(
                        lastFilePath,
                        newShowDraftsDirectory,
                        docsPath,
                    ),
                );
            } catch {
                setDefaultDirectory(
                    await window.electron.getDefaultDocumentsPath(),
                );
            }
        };
        void fetchDefaultDirectory();
    }, [newShowDraftsDirectory]);

    useEffect(() => {
        if (!projectName.trim()) return;
        const nextPath = ensureFileLocationHasProjectName(
            fileLocationManuallyEdited.current ? fileLocation : "",
            projectName,
            defaultDirectory,
        );
        if (!nextPath || nextPath === fileLocation) return;
        setFileLocation(nextPath);
        void window.electron
            .fileExists(nextPath)
            .then(setFileExists)
            .catch(() => setFileExists(false));
    }, [projectName, defaultDirectory, fileLocation]);

    const handleBrowse = async () => {
        const result = await window.electron.showSaveDialog({
            buttonLabel: t("launchpage.newShow.browse"),
            defaultPath: isDraftsLocation
                ? defaultDirectory
                : fileLocation || defaultDirectory,
            filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
        });
        if (!result.canceled && result.filePath) {
            fileLocationManuallyEdited.current = true;
            const withName = ensureFileLocationHasProjectName(
                result.filePath,
                projectName,
            );
            setFileLocation(withName);
            const exists = await window.electron.fileExists(withName);
            setFileExists(exists);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-16">
            <ul className="flex flex-col gap-8">
                {DRILL_IMPORT_STEPS.map((step, index) => {
                    const iconState = isDone
                        ? "done"
                        : index < activeIndex
                          ? "done"
                          : index === activeIndex
                            ? "active"
                            : "pending";
                    return (
                        <li
                            key={step}
                            className="text-body flex items-center gap-8"
                        >
                            <DrillStepIcon state={iconState} />
                            <span
                                className={
                                    iconState === "pending"
                                        ? "text-text-subtitle"
                                        : "text-text"
                                }
                            >
                                {DRILL_IMPORT_STEP_LABELS[step]}
                            </span>
                        </li>
                    );
                })}
            </ul>

            <div className="bg-stroke h-6 w-full overflow-hidden rounded-full">
                <div
                    className="bg-accent h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${fraction * 100}%` }}
                />
            </div>

            {isDone && result && (
                <div className="flex flex-col gap-16">
                    <p className="text-body text-text/80">
                        {result.message} — {result.marchers} marchers,{" "}
                        {result.sets} sets.
                    </p>
                    {result.warnings.map((warning) => (
                        <div
                            key={warning}
                            className="text-sub text-text/80 flex items-start gap-8"
                        >
                            <WarningIcon
                                weight="fill"
                                className="text-yellow shrink-0"
                                size={20}
                            />
                            <span>{warning}</span>
                        </div>
                    ))}

                    <WizardFormField
                        label={t("launchpage.newShow.showName")}
                        required
                    >
                        <Input
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            placeholder={t("launchpage.newShow.showName")}
                            autoFocus
                        />
                    </WizardFormField>
                    <WizardFormField label={t("launchpage.newShow.location")}>
                        <div className="flex items-center gap-8">
                            <div className="text-text-subtitle bg-fg-2 rounded-6 border-stroke min-h-30 grow border px-8 py-4 text-sm">
                                {fileLocation}
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                size="compact"
                                onClick={() => void handleBrowse()}
                            >
                                <FolderOpenIcon size={20} />
                                <T keyName="launchpage.newShow.browse" />
                            </Button>
                        </div>
                    </WizardFormField>
                    {isDraftsLocation ? (
                        <DangerNote>
                            <T keyName="launchpage.newShow.draftsLocationError" />
                        </DangerNote>
                    ) : (
                        fileExists && (
                            <WarningNote>
                                <T keyName="launchpage.newShow.fileExistsWarning" />
                            </WarningNote>
                        )
                    )}

                    <div className="flex w-full justify-end pt-8">
                        <Button
                            onClick={() => onSave(projectName, fileLocation)}
                            disabled={
                                isSaving ||
                                !projectName.trim() ||
                                !fileLocation.trim() ||
                                isDraftsLocation
                            }
                        >
                            <T keyName="launchpage.newShow.create" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
