import { toast } from "sonner";
import type { TFnType } from "@tolgee/react";
import { isWebBuild } from "@/utilities/webBuild";
import { openReleasePage } from "./useUpdateState";

/**
 * "Check for updates" (fork #404), from the menu or the command palette: look now and say what
 * the check found. A found update also shows in the title bar's update pill, which takes it
 * from there.
 */
export async function checkForUpdatesAndReport(t: TFnType) {
    const updates = isWebBuild ? undefined : window.electron?.updates;
    if (!updates) return;
    const id = "check-for-updates";
    toast.loading(t("updates.toast.checking"), { id });
    const state = await updates.check().catch(() => null);
    if (!state) {
        toast.dismiss(id);
        return;
    }
    const { phase } = state;
    switch (phase.kind) {
        case "unsupported":
            toast.info(t(`updates.unsupported.${phase.reason}`), { id });
            return;
        case "upToDate":
        case "idle":
        case "checking":
            toast.success(
                t("updates.toast.upToDate", { version: state.currentVersion }),
                { id },
            );
            return;
        case "available":
        case "downloading":
            toast.info(
                t("updates.toast.available", { version: phase.version }),
                {
                    id,
                    description: state.needsMoveToApplications
                        ? t("updates.popover.moveBody")
                        : phase.kind === "downloading"
                          ? t("updates.toast.downloading")
                          : undefined,
                    action:
                        phase.kind === "available" &&
                        !state.needsMoveToApplications
                            ? {
                                  label: t("updates.action.download"),
                                  onClick: () => void updates.download(),
                              }
                            : undefined,
                },
            );
            return;
        case "downloaded":
            toast.info(t("updates.toast.ready", { version: phase.version }), {
                id,
                action: {
                    label: t("updates.action.updateNow"),
                    onClick: () => void updates.install(),
                },
            });
            return;
        case "error":
            toast.error(t("updates.toast.checkFailed"), {
                id,
                description: phase.message,
                action: {
                    label: t("updates.action.downloadInstaller"),
                    onClick: () => openReleasePage(state, phase.version),
                },
            });
            return;
    }
}
