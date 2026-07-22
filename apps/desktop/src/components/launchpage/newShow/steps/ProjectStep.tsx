import { useCallback, useEffect, useRef, useState } from "react";
import { Input, Button, WarningNote } from "@openmarch/ui";
import { WizardFormField } from "@/components/ui/FormField";
import { T, useTranslate } from "@tolgee/react";
import { FolderOpenIcon } from "@phosphor-icons/react";
import type { NewShowProjectData } from "../../newShowTypes";
import { sanitizeFilename } from "../../newShowCompletion";

const normalizePath = (path: string) => path.replace(/\\/g, "/");

const ensureFileLocationHasProjectName = (
    rawLocation: string,
    projectName: string,
    defaultDirectory?: string,
) => {
    const sanitizedProjectName = sanitizeFilename(projectName);
    const filename = `${sanitizedProjectName}.dots`;

    let finalFileLocation = rawLocation.trim();
    if (finalFileLocation) {
        const normalizedPath = normalizePath(finalFileLocation);
        const pathParts = normalizedPath.split("/");
        const lastPart = pathParts[pathParts.length - 1];

        if (!lastPart) {
            pathParts[pathParts.length - 1] = filename;
        } else if (!lastPart.endsWith(".dots")) {
            pathParts.push(filename);
        } else if (!lastPart.startsWith(sanitizedProjectName)) {
            pathParts[pathParts.length - 1] = filename;
        }
        finalFileLocation = pathParts.join("/");
    } else if (defaultDirectory) {
        finalFileLocation = `${normalizePath(defaultDirectory)}/${filename}`;
    }

    return finalFileLocation;
};

interface ProjectStepProps {
    project: NewShowProjectData | null;
    onChange: (project: NewShowProjectData) => void;
}

export default function ProjectStep({ project, onChange }: ProjectStepProps) {
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

    const syncToParent = useCallback(
        (
            name: string,
            location: string,
            designerVal: string,
            clientVal: string,
        ) => {
            const finalLocation = ensureFileLocationHasProjectName(
                location,
                name,
                defaultDirectory,
            );
            onChange({
                projectName: name.trim(),
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
                const storedDefault =
                    await window.electron.getDefaultFilesDirectory();
                if (storedDefault?.trim()) {
                    setDefaultDirectory(normalizePath(storedDefault));
                    return;
                }
                const lastFilePath = await window.electron.databaseGetPath();
                if (lastFilePath?.trim()) {
                    const normalizedPath = normalizePath(lastFilePath);
                    const pathParts = normalizedPath.split("/");
                    pathParts.pop();
                    const directory = pathParts.join("/");
                    if (directory) {
                        setDefaultDirectory(directory);
                        return;
                    }
                }
                const docsPath =
                    await window.electron.getDefaultDocumentsPath();
                setDefaultDirectory(docsPath);
            } catch {
                const docsPath =
                    await window.electron.getDefaultDocumentsPath();
                setDefaultDirectory(docsPath);
            }
        };
        void fetchDefaultDirectory();
    }, []);

    useEffect(() => {
        if (!projectName.trim() || fileLocationManuallyEdited.current) return;
        const autoPath = ensureFileLocationHasProjectName(
            "",
            projectName,
            defaultDirectory,
        );
        if (autoPath) {
            setFileLocation(autoPath);
            void window.electron
                .fileExists(autoPath)
                .then(setFileExists)
                .catch(() => setFileExists(false));
            syncToParent(projectName, autoPath, designer, client);
        }
    }, [projectName, defaultDirectory, designer, client, syncToParent]);

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
            defaultPath: fileLocation || defaultDirectory,
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
                        const name = e.target.value;
                        setProjectName(name);
                        syncToParent(name, fileLocation, designer, client);
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
            {fileExists && (
                <WarningNote>
                    <T keyName="launchpage.newShow.fileExistsWarning" />
                </WarningNote>
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
