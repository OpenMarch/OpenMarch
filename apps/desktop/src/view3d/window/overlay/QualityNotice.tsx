/**
 * Says why the 3D View went to low quality on its own (ui.md UI-2), as the
 * 2D field's low-quality notice does (`field/three/FieldQualityNotice.tsx`):
 *
 * - `software`: WebGL draws in software here, so the view stays on Low and
 *   is still slow. Explained once per computer.
 * - `autoLowered`: Automatic dropped to Low because frames were slow.
 *   Explained each time it happens.
 *
 * The window has no toasts, so it is a small card at the bottom right that
 * stays until the viewer answers it. After Automatic lowered the quality it
 * offers the fix in place: Use High (a fixed choice, so it stays high) or
 * Keep Low. The same choice is under Quality in 3D View settings ›
 * Preferences.
 */
import { useEffect, useState } from "react";
import { useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import { isWebBuild } from "@/utilities/webBuild";
import { useView3dSceneStore } from "../sceneStore";

export type QualityNoticeReason = "software" | "autoLowered";

/** Set once the software explanation was shown on this computer. */
export const QUALITY_NOTICE_STORAGE_KEY = "view3d.softwareNoticeSeen";

/** Marks the software explanation shown; false if it already was. */
export function markSoftwareExplained(storage?: Storage): boolean {
    try {
        const store = storage ?? window.localStorage;
        if (store.getItem(QUALITY_NOTICE_STORAGE_KEY) === "true") return false;
        store.setItem(QUALITY_NOTICE_STORAGE_KEY, "true");
    } catch {
        // Blocked storage: explained again next time
    }
    return true;
}

/** Which notice to show now, if any. */
function useQualityNoticeReason(): [QualityNoticeReason | null, () => void] {
    const softwareGl = useView3dSceneStore((s) => s.softwareGl);
    const autoLowered = useView3dSceneStore((s) => s.autoLowered);
    const [reason, setReason] = useState<QualityNoticeReason | null>(null);
    useEffect(() => {
        if (softwareGl && markSoftwareExplained()) setReason("software");
    }, [softwareGl]);
    useEffect(() => {
        if (autoLowered) setReason("autoLowered");
    }, [autoLowered]);
    return [reason, () => setReason(null)];
}

export function QualityNotice() {
    const { t } = useTranslate();
    const [reason, dismiss] = useQualityNoticeReason();
    const setQualityMode = useView3dSceneStore((s) => s.setQualityMode);
    if (!reason) return null;
    return (
        <div
            role="status"
            data-testid="view3d-quality-notice"
            data-reason={reason}
            className="border-stroke bg-modal backdrop-blur-32 rounded-6 shadow-modal text-text pointer-events-auto flex w-[22rem] max-w-full flex-col gap-8 border p-12"
        >
            <p className="text-body font-medium">{t("view3d.quality.title")}</p>
            <p className="text-sub text-text/60">
                {reason === "software"
                    ? t(
                          // The 3D View web preview runs in a browser too
                          isWebBuild ||
                              import.meta.env.VITE_VIEW3D_WEB_PREVIEW === "true"
                              ? "view3d.quality.software.web"
                              : "view3d.quality.software.desktop",
                      )
                    : t("view3d.quality.autoLowered")}
            </p>
            {reason === "software" ? (
                <div>
                    <Button size="compact" onClick={dismiss}>
                        {t("view3d.quality.dismiss")}
                    </Button>
                </div>
            ) : (
                <div className="flex gap-8">
                    <Button
                        size="compact"
                        data-testid="view3d-quality-use-high"
                        onClick={() => {
                            setQualityMode("high");
                            dismiss();
                        }}
                    >
                        {t("view3d.quality.useHigh")}
                    </Button>
                    <Button
                        size="compact"
                        variant="secondary"
                        data-testid="view3d-quality-keep-low"
                        onClick={dismiss}
                    >
                        {t("view3d.quality.keepLow")}
                    </Button>
                </div>
            )}
        </div>
    );
}
