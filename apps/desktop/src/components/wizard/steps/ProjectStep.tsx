import { useState, useEffect } from "react";
import { Input, Button, WarningNote } from "@openmarch/ui";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import { StaticFormField } from "@/components/ui/FormField";
import { T } from "@tolgee/react";
import { FolderOpenIcon } from "@phosphor-icons/react";

export default function ProjectStep() {
    const { wizardState, updateProject } = useGuidedSetupStore();
    const [projectName, setProjectName] = useState<string>(
        wizardState?.project?.projectName || "",
    );
    const [fileLocation, setFileLocation] = useState<string>(
        wizardState?.project?.fileLocation || "",
    );
    const [designer, setDesigner] = useState<string>(
        wizardState?.project?.designer || "",
    );
    const [client, setClient] = useState<string>(
        wizardState?.project?.client || "",
    );
    const [defaultDocumentsPath, setDefaultDocumentsPath] =
        useState<string>("");
    const [fileExists, setFileExists] = useState<boolean>(false);

    // Get default documents path on mount
    useEffect(() => {
        const fetchDefaultPath = async () => {
            try {
                const docsPath =
                    await window.electron.getDefaultDocumentsPath();
                setDefaultDocumentsPath(docsPath);
            } catch (error) {
                console.error("Error getting default documents path:", error);
            }
        };
        void fetchDefaultPath();
    }, []);

    // Check if file exists when fileLocation changes
    useEffect(() => {
        const checkFileExists = async () => {
            if (fileLocation.trim()) {
                try {
                    const exists = await window.electron.fileExists(
                        fileLocation.trim(),
                    );
                    setFileExists(exists);
                } catch (error) {
                    console.error("Error checking if file exists:", error);
                    setFileExists(false);
                }
            } else {
                setFileExists(false);
            }
        };
        void checkFileExists();
    }, [fileLocation]);

    // Update file location when project name changes (if location not manually set)
    useEffect(() => {
        if (
            projectName &&
            defaultDocumentsPath &&
            !wizardState?.project?.fileLocation
        ) {
            // Electron will normalize the path separator automatically
            const defaultPath = `${defaultDocumentsPath}/${projectName}.dots`;
            setFileLocation(defaultPath);
        }
    }, [projectName, defaultDocumentsPath, wizardState?.project?.fileLocation]);

    const handleBrowseLocation = async () => {
        try {
            // Build default path: use current fileLocation, or default to documents/projectName.dots
            // Electron will normalize path separators automatically
            let defaultPath = fileLocation;
            if (!defaultPath) {
                if (defaultDocumentsPath && projectName) {
                    defaultPath = `${defaultDocumentsPath}/${projectName}.dots`;
                } else if (defaultDocumentsPath) {
                    defaultPath = `${defaultDocumentsPath}/untitled.dots`;
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
                setFileLocation(result.filePath);
            }
        } catch (error) {
            console.error("Error selecting file location:", error);
        }
    };

    // Update wizard state when values change
    useEffect(() => {
        if (projectName.trim()) {
            updateProject({
                projectName: projectName.trim(),
                fileLocation: fileLocation.trim() || undefined,
                designer: designer.trim() || undefined,
                client: client.trim() || undefined,
            });
        } else {
            updateProject(null);
        }
    }, [projectName, fileLocation, designer, client, updateProject]);

    // Create database file when fileLocation is set (for wizard steps that need database access)
    useEffect(() => {
        if (fileLocation.trim()) {
            const createDb = async () => {
                try {
                    await window.electron.databaseCreateForWizard(
                        fileLocation.trim(),
                    );
                } catch (error) {
                    console.error("Error creating database for wizard:", error);
                }
            };
            void createDb();
        }
    }, [fileLocation]);

    return (
        <div className="flex flex-col gap-16">
            <StaticFormField
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
                />
            </StaticFormField>

            <StaticFormField
                label={
                    <>
                        <T keyName="wizard.project.fileLocation" />{" "}
                        <span className="text-red">*</span>
                    </>
                }
            >
                <div className="flex flex-col gap-8">
                    <div className="flex gap-8">
                        <Input
                            value={fileLocation}
                            onChange={(e) => setFileLocation(e.target.value)}
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
            </StaticFormField>

            <StaticFormField label={<T keyName="wizard.project.designer" />}>
                <Input
                    value={designer}
                    onChange={(e) => setDesigner(e.target.value)}
                    placeholder="Designer Name"
                />
            </StaticFormField>

            <StaticFormField label={<T keyName="wizard.project.client" />}>
                <Input
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    placeholder="Client/Organization Name"
                />
            </StaticFormField>
        </div>
    );
}
