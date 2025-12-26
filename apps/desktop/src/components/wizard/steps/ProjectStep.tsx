import { useState, useEffect, useRef } from "react";
import { Input, Button, WarningNote } from "@openmarch/ui";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { WizardFormField } from "@/components/ui/FormField";
import { T } from "@tolgee/react";
import { FolderOpenIcon } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function ProjectStep() {
    const { wizardState, updateProject } = useGuidedSetupStore();
    const [projectName, setProjectName] = useState<string>(
        wizardState?.project?.projectName || "",
    );
    const fileCreatedRef = useRef<boolean>(false);
    const [isCreatingFile, setIsCreatingFile] = useState<boolean>(false);

    // Extract directory from stored fileLocation if it exists (remove filename)
    const getInitialFileLocation = (): string => {
        const stored = wizardState?.project?.fileLocation;
        if (!stored) return "";
        // If stored location has a filename, extract just the directory
        const normalizedPath = stored.replace(/\\/g, "/");
        const pathParts = normalizedPath.split("/");
        const lastPart = pathParts[pathParts.length - 1];
        // If last part looks like a filename (has .dots extension), remove it
        if (lastPart && lastPart.endsWith(".dots")) {
            pathParts.pop();
            return pathParts.join("/");
        }
        return stored;
    };

    const [fileLocation, setFileLocation] = useState<string>(
        getInitialFileLocation(),
    );
    const [designer, setDesigner] = useState<string>(
        wizardState?.project?.designer || "",
    );
    const [client, setClient] = useState<string>(
        wizardState?.project?.client || "",
    );
    const [defaultDirectory, setDefaultDirectory] = useState<string>("");
    const [fileExists, setFileExists] = useState<boolean>(false);
    const fileLocationManuallyEdited = useRef<boolean>(
        !!wizardState?.project?.fileLocation,
    );

    // Get default directory from last file or documents path on mount
    useEffect(() => {
        const fetchDefaultDirectory = async () => {
            try {
                // Try to get the directory from the last opened file
                const lastFilePath = await window.electron.databaseGetPath();
                if (lastFilePath && lastFilePath.trim()) {
                    // Extract directory from the last file path
                    const normalizedPath = lastFilePath.replace(/\\/g, "/");
                    const pathParts = normalizedPath.split("/");
                    pathParts.pop(); // Remove filename
                    const directory = pathParts.join("/");
                    if (directory && directory.length > 0) {
                        setDefaultDirectory(directory);
                        return;
                    }
                }
                // Fallback to documents path if no last file or no directory extracted
                const docsPath =
                    await window.electron.getDefaultDocumentsPath();
                if (docsPath) {
                    setDefaultDirectory(docsPath);
                }
            } catch (error) {
                console.error("Error getting default directory:", error);
                // Fallback to documents path on error
                try {
                    const docsPath =
                        await window.electron.getDefaultDocumentsPath();
                    if (docsPath) {
                        setDefaultDirectory(docsPath);
                    }
                } catch (fallbackError) {
                    console.error(
                        "Error getting fallback documents path:",
                        fallbackError,
                    );
                }
            }
        };
        void fetchDefaultDirectory();
    }, []);

    // Check if file exists when fileLocation changes
    useEffect(() => {
        const checkFileExists = async () => {
            if (!fileLocation.trim()) {
                setFileExists(false);
                return;
            }

            try {
                const trimmed = fileLocation.trim();
                const withExtension = trimmed.endsWith(".dots")
                    ? trimmed
                    : `${trimmed}.dots`;
                const normalized = withExtension.replace(/\\/g, "/");

                const [exists, currentPath] = await Promise.all([
                    window.electron.fileExists(withExtension),
                    window.electron.databaseGetPath(),
                ]);

                const isCurrentFile =
                    currentPath?.trim().replace(/\\/g, "/") === normalized;
                setFileExists(exists && !isCurrentFile);
            } catch (error) {
                console.error("Error checking if file exists:", error);
                setFileExists(false);
            }
        };
        void checkFileExists();
    }, [fileLocation]);

    // Update file location when project name changes (if location not manually edited)
    useEffect(() => {
        if (!projectName || fileLocationManuallyEdited.current) return;

        // Prefer defaultDirectory if available
        if (defaultDirectory && defaultDirectory.length > 0) {
            const defaultPath = `${defaultDirectory}/${projectName}.dots`;
            setFileLocation(defaultPath);
            return;
        }

        // If we have a fileLocation, update it
        // Use a function form of setState to access current fileLocation value
        setFileLocation((currentLocation) => {
            if (!currentLocation || currentLocation.trim().length === 0) {
                return currentLocation;
            }

            const normalizedPath = currentLocation.replace(/\\/g, "/");
            const pathParts = normalizedPath.split("/");
            const lastPart = pathParts[pathParts.length - 1];

            // If last part is a filename (.dots), replace it with new project name
            if (lastPart && lastPart.endsWith(".dots")) {
                pathParts[pathParts.length - 1] = `${projectName}.dots`;
                return pathParts.join("/");
            } else {
                // If it's just a directory (no filename), append the project name
                return `${currentLocation}/${projectName}.dots`;
            }
        });
    }, [projectName, defaultDirectory]);

    const handleBrowseLocation = async () => {
        try {
            // Build default path: use current fileLocation, or default to defaultDirectory/projectName.dots
            // Electron will normalize path separators automatically
            let defaultPath = fileLocation;
            if (!defaultPath) {
                if (defaultDirectory && projectName) {
                    defaultPath = `${defaultDirectory}/${projectName}.dots`;
                } else if (defaultDirectory) {
                    defaultPath = `${defaultDirectory}/untitled.dots`;
                } else if (projectName) {
                    defaultPath = `${projectName}.dots`;
                } else {
                    defaultPath = "untitled.dots";
                }
            }

            const result = await window.electron.showSaveDialog({
                buttonLabel: "Select Location",
                filters: [{ name: "OpenMarch File", extensions: ["dots"] }],
                defaultPath: defaultPath,
            });
            if (result && !result.canceled && result.filePath) {
                fileLocationManuallyEdited.current = true;
                setFileLocation(result.filePath);
            }
        } catch (error) {
            console.error("Error selecting file location:", error);
        }
    };

    // Create database file when both projectName and fileLocation are set
    useEffect(() => {
        const createDatabaseFile = async () => {
            // Skip if file already created or currently creating
            if (fileCreatedRef.current || isCreatingFile) return;

            // Need both project name and file location
            if (!projectName.trim() || !fileLocation.trim()) return;

            // Ensure fileLocation includes the project name
            let finalFileLocation = fileLocation.trim();
            const normalizedPath = finalFileLocation.replace(/\\/g, "/");
            const pathParts = normalizedPath.split("/");
            const lastPart = pathParts[pathParts.length - 1];
            const sanitizedProjectName = projectName
                .trim()
                .replace(/[<>:"/\\|?*]/g, "_");

            // Ensure fileLocation ends with .dots
            if (!lastPart.endsWith(".dots")) {
                if (lastPart && lastPart.length > 0) {
                    // It's a directory, append project name
                    pathParts.push(`${sanitizedProjectName}.dots`);
                } else {
                    // Empty last part, just add the filename
                    pathParts.push(`${sanitizedProjectName}.dots`);
                }
                finalFileLocation = pathParts.join("/");
            } else if (!lastPart.startsWith(sanitizedProjectName)) {
                // Filename doesn't match project name, update it
                pathParts[pathParts.length - 1] =
                    `${sanitizedProjectName}.dots`;
                finalFileLocation = pathParts.join("/");
            }

            // Check if database is already ready (file might already exist)
            const dbReady = await window.electron.databaseIsReady();
            const currentPath = await window.electron.databaseGetPath();
            const normalizedFinalPath = finalFileLocation.replace(/\\/g, "/");
            const normalizedCurrentPath = currentPath
                ?.trim()
                .replace(/\\/g, "/");

            // If database is ready and path matches, file is already created
            if (dbReady && normalizedCurrentPath === normalizedFinalPath) {
                fileCreatedRef.current = true;
                return;
            }

            // Create the file
            setIsCreatingFile(true);
            try {
                const result =
                    await window.electron.databaseCreateForWizard(
                        finalFileLocation,
                    );
                if (result === 200) {
                    fileCreatedRef.current = true;
                    // Update fileLocation in state if it changed
                    if (finalFileLocation !== fileLocation) {
                        setFileLocation(finalFileLocation);
                    }
                } else {
                    console.error("Failed to create database file");
                    toast.error(
                        "Failed to create database file. Please try again.",
                    );
                }
            } catch (error) {
                console.error("Error creating database file:", error);
                toast.error(
                    "Failed to create database file. Please try again.",
                );
            } finally {
                setIsCreatingFile(false);
            }
        };

        void createDatabaseFile();
    }, [projectName, fileLocation, isCreatingFile]);

    // Update wizard state when values change
    useEffect(() => {
        if (projectName.trim()) {
            // Ensure fileLocation includes the project name if it's set
            let finalFileLocation = fileLocation.trim();
            if (finalFileLocation) {
                const normalizedPath = finalFileLocation.replace(/\\/g, "/");
                const pathParts = normalizedPath.split("/");
                const lastPart = pathParts[pathParts.length - 1];
                const sanitizedProjectName = projectName
                    .trim()
                    .replace(/[<>:"/\\|?*]/g, "_");

                // If last part doesn't end with .dots or doesn't match project name, fix it
                if (!lastPart.endsWith(".dots")) {
                    // If it's a directory, append project name
                    pathParts.push(`${sanitizedProjectName}.dots`);
                    finalFileLocation = pathParts.join("/");
                } else if (!lastPart.startsWith(sanitizedProjectName)) {
                    // If filename doesn't match project name, update it
                    pathParts[pathParts.length - 1] =
                        `${sanitizedProjectName}.dots`;
                    finalFileLocation = pathParts.join("/");
                }
            } else if (defaultDirectory) {
                // If no fileLocation but we have defaultDirectory, construct it
                const sanitizedProjectName = projectName
                    .trim()
                    .replace(/[<>:"/\\|?*]/g, "_");
                finalFileLocation = `${defaultDirectory}/${sanitizedProjectName}.dots`;
            }

            updateProject({
                projectName: projectName.trim(),
                fileLocation: finalFileLocation || undefined,
                designer: designer.trim() || undefined,
                client: client.trim() || undefined,
            });
        } else {
            updateProject(null);
        }
    }, [
        projectName,
        fileLocation,
        designer,
        client,
        defaultDirectory,
        updateProject,
    ]);

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-32">
            <WizardFormField
                label={
                    <>
                        <T keyName="wizard.project.projectName" />{" "}
                        <span className="text-red">*</span>
                    </>
                }
            >
                <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="My Show"
                    className="w-full"
                />
            </WizardFormField>

            <WizardFormField
                label={
                    <>
                        <T keyName="wizard.project.fileLocation" />{" "}
                        <span className="text-red">*</span>
                    </>
                }
            >
                <div className="flex flex-col gap-10">
                    <div className="flex gap-10">
                        <Input
                            value={fileLocation}
                            onChange={(e) => {
                                fileLocationManuallyEdited.current = true;
                                setFileLocation(e.target.value);
                            }}
                            placeholder="/path/to/file.dots"
                            className="flex-1"
                        />
                        <Button
                            variant="secondary"
                            onClick={handleBrowseLocation}
                            className="flex items-center gap-8"
                        >
                            <FolderOpenIcon size={20} />
                            <T keyName="wizard.project.browse" />
                        </Button>
                    </div>
                    {fileExists && fileLocation.trim() && (
                        <WarningNote>
                            <T keyName="wizard.project.fileExistsWarning" />
                        </WarningNote>
                    )}
                </div>
            </WizardFormField>

            <WizardFormField label={<T keyName="wizard.project.designer" />}>
                <Input
                    value={designer}
                    onChange={(e) => setDesigner(e.target.value)}
                    placeholder="Designer Name"
                    className="w-full"
                />
            </WizardFormField>

            <WizardFormField label={<T keyName="wizard.project.client" />}>
                <Input
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    placeholder="Client/Organization Name"
                    className="w-full"
                />
            </WizardFormField>
        </div>
    );
}
