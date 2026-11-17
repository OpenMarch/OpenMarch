import { useState } from "react";
import { T, useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import SettingRow from "@/settings/SettingRow";
import type { UpdateState } from "@/global/updates";
import { useUpdateState } from "./useUpdateState";

/**
 * Settings › General "Updates" (fork #404): the running version, what the updater is doing,
 * and "Check for updates". Desktop only.
 */
export default function UpdateSettingsRow() {
    const state = useUpdateState();
    const [checking, setChecking] = useState(false);
    if (!state) return null;
    const unsupported = state.phase.kind === "unsupported";
    return (
        <SettingRow
            label={<T keyName="settings.general.updates" />}
            description={<UpdateStatus state={state} />}
        >
            {!unsupported && (
                <Button
                    size="compact"
                    variant="secondary"
                    data-testid="settings-check-for-updates"
                    disabled={
                        checking ||
                        state.phase.kind === "checking" ||
                        state.phase.kind === "downloading"
                    }
                    onClick={() => {
                        setChecking(true);
                        void window.electron.updates
                            .check()
                            .finally(() => setChecking(false));
                    }}
                >
                    <T keyName="settings.general.checkForUpdates" />
                </Button>
            )}
        </SettingRow>
    );
}

function UpdateStatus({ state }: { state: UpdateState }) {
    const { t } = useTranslate();
    const version = state.currentVersion;
    const { phase } = state;
    switch (phase.kind) {
        case "unsupported":
            return <>{t(`updates.unsupported.${phase.reason}`)}</>;
        case "idle":
            return <>{t("settings.general.updates.version", { version })}</>;
        case "checking":
            return <>{t("settings.general.updates.checking", { version })}</>;
        case "upToDate":
            return <>{t("settings.general.updates.upToDate", { version })}</>;
        case "available":
            return (
                <>
                    {t("settings.general.updates.available", {
                        version: phase.version,
                    })}
                </>
            );
        case "downloading":
            return (
                <>
                    {t("settings.general.updates.downloading", {
                        version: phase.version,
                        percent: Math.floor(phase.percent),
                    })}
                </>
            );
        case "downloaded":
            return (
                <>
                    {t("settings.general.updates.ready", {
                        version: phase.version,
                    })}
                </>
            );
        case "error":
            return (
                <>
                    {t("settings.general.updates.failed", { version })}{" "}
                    <span className="font-mono">{phase.message}</span>
                </>
            );
    }
}
