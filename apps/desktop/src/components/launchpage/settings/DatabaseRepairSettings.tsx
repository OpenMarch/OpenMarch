import { useEffect, useState } from "react";
import { T, useTolgee } from "@tolgee/react";
import { toast } from "sonner";
import SettingRow from "@/settings/SettingRow";
import SettingsPanel from "@/settings/SettingsPanel";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogTrigger,
    Button,
} from "@openmarch/ui";

export default function DatabaseRepairSettings() {
    const { t } = useTolgee();
    const [isOpen, setIsOpen] = useState(false);
    const [isRepairing, setIsRepairing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showOpen, setShowOpen] = useState<boolean | null>(null);

    useEffect(() => {
        let cancelled = false;
        void window.electron
            .databaseIsReady()
            .then((ready) => {
                if (!cancelled) setShowOpen(ready);
            })
            .catch((err: unknown) => {
                console.error("Failed to check database state:", err);
                if (!cancelled) setShowOpen(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleRepair = async () => {
        setIsRepairing(true);
        setError(null);

        try {
            // Get current database path
            const currentPath = await window.electron.databaseGetPath();
            if (!currentPath) {
                throw new Error("No database file is currently open");
            }

            // Call repair function
            // The IPC handler will handle setting the new path and reloading the window
            await window.electron.repairDatabase(currentPath);

            toast.success(t("settings.repairDotsFile.success"));

            // Settings live in their own window, so the main window has to be reloaded to pick up the repaired file
            window.electron.reloadMainWindow();
        } catch (err) {
            const errorMessage =
                err instanceof Error ? err.message : "Unknown error occurred";
            setError(errorMessage);
            setIsRepairing(false);
            // Show error toast
            toast.error(
                t("settings.repairDotsFile.error", { error: errorMessage }),
            );
        }
    };

    if (showOpen === null) return null;

    if (!showOpen) {
        return (
            <p className="text-body text-text-subtitle">
                <T keyName="settings.database.noShowOpen" />
            </p>
        );
    }

    return (
        <SettingsPanel>
            <SettingRow
                label={<T keyName="settings.repairDotsFile.title" />}
                htmlFor="repair-dots-file"
            >
                <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
                    <AlertDialogTrigger asChild>
                        <Button variant="secondary" id="repair-dots-file">
                            <T keyName="settings.repairDotsFile" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogTitle>
                            <T keyName="settings.repairDotsFile.title" />
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            <T keyName="settings.repairDotsFile.description" />
                        </AlertDialogDescription>
                        {error && (
                            <div className="text-red text-body">
                                <T
                                    keyName="settings.repairDotsFile.error"
                                    params={{ error }}
                                />
                            </div>
                        )}
                        <div className="flex w-full justify-end gap-8">
                            <AlertDialogCancel asChild>
                                <Button
                                    variant="secondary"
                                    disabled={isRepairing}
                                    onClick={() => {
                                        setIsOpen(false);
                                        setError(null);
                                    }}
                                >
                                    <T keyName="settings.repairDotsFile.cancel" />
                                </Button>
                            </AlertDialogCancel>
                            <AlertDialogAction>
                                <Button
                                    variant="primary"
                                    disabled={isRepairing}
                                    onClick={handleRepair}
                                >
                                    {isRepairing ? (
                                        <T keyName="settings.repairDotsFile.repairing" />
                                    ) : (
                                        <T keyName="settings.repairDotsFile.confirm" />
                                    )}
                                </Button>
                            </AlertDialogAction>
                        </div>
                    </AlertDialogContent>
                </AlertDialog>
            </SettingRow>
        </SettingsPanel>
    );
}
