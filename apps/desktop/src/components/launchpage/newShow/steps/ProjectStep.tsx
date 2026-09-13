import { useCallback, useEffect, useRef, useState } from "react";
import { Input, Button, WarningNote, DangerNote } from "@openmarch/ui";
import { WizardFormField } from "@/components/ui/FormField";
import { T, useTranslate } from "@tolgee/react";
import { FolderOpenIcon } from "@phosphor-icons/react";
import type { NewShowProjectData } from "../../newShowTypes";
import {
    ensureFileLocationHasProjectName,
    isPathUnderDirectory,
    resolveDefaultSaveDirectory,
} from "../../newShowCompletion";

interface ProjectStepProps {
    project: NewShowProjectData | null;
    onChange: (project: NewShowProjectData) => void;
    newShowDraftsDirectory: string;
}

export default function ProjectStep({
    project,
    onChange,
    newShowDraftsDirectory,
}: ProjectStepProps) {
    const { t } = useTranslate();
    const [projectName, setProjectName] = useState(project?.projectName ?? "");
    const [fileLocation, setFileLocation] = useState(
        project?.fileLocation ?? "",
    );
    const [designer, setDesigner] = useState(project?.designer ?? "");
    const [client, setClient] = useState(project?.client ?? "");
    const [defaultDirectory, setDefaultDirectory] = useState("");
    const [fileExists, setFileExists] = useState(false);
    const fileLocationManuallyEdited = useRef(!!project?.fileLocation);
    const isDraftsLocation = isPathUnderDirectory(
        fileLocation,
        newShowDraftsDirectory,
    );

    const syncToParent = useCallback(
        (
            name: string,
            location: string,
            designerVal: string,
            clientVal: string,
        ) => {
            const trimmedName = name.trim();
            // Keep the existing path when the name is cleared so we don't
            // rewrite it to ".dots" while validation blocks advancing.
            const finalLocation = trimmedName
                ? ensureFileLocationHasProjectName(
                      location,
                      name,
                      defaultDirectory,
                  )
                : location;
            onChange({
                projectName: trimmedName,
                fileLocation: finalLocation,
                designer: designerVal.trim() || undefined,
                client: clientVal.trim() || undefined,
            });
        },
        [defaultDirectory, onChange],
    );

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
                const docsPath =
                    await window.electron.getDefaultDocumentsPath();
                setDefaultDirectory(docsPath);
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
        if (!nextPath) return;
        if (nextPath !== fileLocation) {
            setFileLocation(nextPath);
            void window.electron
                .fileExists(nextPath)
                .then(setFileExists)
                .catch(() => setFileExists(false));
        }
        syncToParent(projectName, nextPath, designer, client);
    }, [
        projectName,
        defaultDirectory,
        fileLocation,
        designer,
        client,
        syncToParent,
    ]);

    const hasSyncedDefaultDirectory = useRef(false);
    useEffect(() => {
        if (!defaultDirectory || hasSyncedDefaultDirectory.current) return;
        hasSyncedDefaultDirectory.current = true;
        syncToParent(projectName, fileLocation, designer, client);
    }, [
        defaultDirectory,
        projectName,
        fileLocation,
        designer,
        client,
        syncToParent,
    ]);

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
            syncToParent(projectName, withName, designer, client);
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-lg flex-col gap-16">
            <WizardFormField label={t("launchpage.newShow.showName")} required>
                <Input
                    value={projectName}
                    onChange={(e) => {
                        const value = e.target.value;
                        setProjectName(value);
                        if (!value.trim()) {
                            syncToParent(value, fileLocation, designer, client);
                            return;
                        }
                        const nextPath = ensureFileLocationHasProjectName(
                            fileLocationManuallyEdited.current
                                ? fileLocation
                                : "",
                            value,
                            defaultDirectory,
                        );
                        if (nextPath && nextPath !== fileLocation) {
                            setFileLocation(nextPath);
                            void window.electron
                                .fileExists(nextPath)
                                .then(setFileExists)
                                .catch(() => setFileExists(false));
                        }
                        syncToParent(
                            value,
                            nextPath || fileLocation,
                            designer,
                            client,
                        );
                    }}
                    placeholder={t("launchpage.newShow.showName")}
                    autoFocus
                />
                <div className="flex items-center gap-8">
                    <div className="text-text-subtitle bg-fg-2 rounded-6 border-stroke min-h-30 grow border px-8 py-4 text-sm">
                        {fileLocation ?? ""}
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
            <WizardFormField label={t("launchpage.newShow.designer")}>
                <Input
                    value={designer}
                    onChange={(e) => {
                        const value = e.target.value;
                        setDesigner(value);
                        syncToParent(projectName, fileLocation, value, client);
                    }}
                />
            </WizardFormField>
            <WizardFormField label={t("launchpage.newShow.client")}>
                <Input
                    value={client}
                    onChange={(e) => {
                        const value = e.target.value;
                        setClient(value);
                        syncToParent(
                            projectName,
                            fileLocation,
                            designer,
                            value,
                        );
                    }}
                />
            </WizardFormField>
        </div>
    );
}
