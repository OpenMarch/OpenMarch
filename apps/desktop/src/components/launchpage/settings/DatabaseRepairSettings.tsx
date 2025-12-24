import { useState } from "react";
import { T, useTolgee } from "@tolgee/react";
import { toast } from "sonner";
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

            // Show success toast before window reloads
            toast.success(t("settings.repairDotsFile.success"));

            // If we get here without error, the window will reload automatically
            // via setActiveDb() in the IPC handler, so we don't need to do anything else
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

    return (
        <div className="bg-fg-1 border-stroke rounded-6 flex flex-col gap-16 border p-12">
            <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
                <AlertDialogTrigger asChild>
                    <Button variant="secondary">
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
                        <AlertDialogAction asChild>
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
        </div>
    );
}
