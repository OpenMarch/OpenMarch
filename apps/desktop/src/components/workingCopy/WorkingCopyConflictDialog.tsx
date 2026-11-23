import { useState } from "react";
import { T, useTolgee } from "@tolgee/react";
import { toast } from "sonner";
import { WarningIcon } from "@phosphor-icons/react";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    Button,
} from "@openmarch/ui";
import type { WorkingCopyConflictChoice } from "@om-electron/database/workingCopy/WorkingCopySession";
import { fileNameOf, useWorkingCopyStatus } from "@/hooks/useWorkingCopyStatus";

/**
 * Asks what to do when the show changed or disappeared on disk since OpenMarch last saved it,
 * so the latest changes weren't written over it (ADR 0018).
 */
export default function WorkingCopyConflictDialog() {
    const { t } = useTolgee(["language"]);
    const status = useWorkingCopyStatus();
    const [busy, setBusy] = useState(false);
    const conflict = status?.state === "conflict" ? status.conflict : undefined;
    const missing = conflict?.reason === "missing";
    const name = status ? fileNameOf(status.showPath) : "";

    const resolve = async (choice: WorkingCopyConflictChoice) => {
        setBusy(true);
        try {
            const outcome =
                await window.electron.workingCopy.resolveConflict(choice);
            if (!outcome.ok && !("cancelled" in outcome))
                toast.error(outcome.message);
        } catch (error) {
            toast.error(String(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <AlertDialog open={!!conflict}>
            <AlertDialogContent>
                <div
                    className="flex flex-col gap-12"
                    data-testid="working-copy-conflict"
                >
                    <div className="flex items-center gap-8">
                        <WarningIcon size={24} className="text-yellow" />
                        <AlertDialogTitle>
                            {missing
                                ? t("workingCopy.missing.title")
                                : t("workingCopy.conflict.title")}
                        </AlertDialogTitle>
                    </div>
                    <AlertDialogDescription>
                        {missing ? (
                            <T
                                keyName="workingCopy.missing.description"
                                params={{ name }}
                            />
                        ) : (
                            <T
                                keyName="workingCopy.conflict.description"
                                params={{ name }}
                            />
                        )}
                    </AlertDialogDescription>
                    <div className="flex flex-wrap justify-end gap-8">
                        {!missing && (
                            <Button
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void resolve("keepTheirs")}
                            >
                                {t("workingCopy.conflict.keepTheirs")}
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void resolve("saveCopy")}
                        >
                            {t("workingCopy.conflict.saveCopy")}
                        </Button>
                        <Button
                            variant="primary"
                            disabled={busy}
                            onClick={() => void resolve("keepMine")}
                        >
                            {missing
                                ? t("workingCopy.missing.saveHere")
                                : t("workingCopy.conflict.keepMine")}
                        </Button>
                    </div>
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
