import { useEffect } from "react";
import { toast } from "sonner";
import { T, useTranslate } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import { isWebBuild } from "@/utilities/webBuild";
import type { LowQualityReason } from "@/field/fieldQuality";

/** The reasons whose explanation was shown on this machine, kept across sessions. */
export const QUALITY_NOTICE_STORAGE_KEY = "openmarch:field:qualityNoticeSeen";
/** A crash is about this session only: explained once per session. */
let crashExplained = false;

function seenReasons(): string[] {
    try {
        const saved = JSON.parse(
            localStorage.getItem(QUALITY_NOTICE_STORAGE_KEY) ?? "[]",
        ) as unknown;
        return Array.isArray(saved) ? saved.map(String) : [];
    } catch {
        return [];
    }
}

/** Marks `reason` explained; false if it already was. */
function markExplained(reason: "software" | "gpuCrashed"): boolean {
    if (reason === "gpuCrashed") {
        if (crashExplained) return false;
        crashExplained = true;
        return true;
    }
    const seen = seenReasons();
    if (seen.includes(reason)) return false;
    try {
        localStorage.setItem(
            QUALITY_NOTICE_STORAGE_KEY,
            JSON.stringify([...seen, reason]),
        );
    } catch {
        // Blocked storage: explained again next session
    }
    return true;
}

/**
 * Explains once why the field went to low-quality mode on its own, and how to
 * get the full view back (ADR 0005 D-3). Performance mode is the user's own
 * choice, and no WebGL is explained in the field itself.
 */
export function useFieldQualityNotice(reason: LowQualityReason | null) {
    const { t } = useTranslate();
    useEffect(() => {
        if (reason !== "software" && reason !== "gpuCrashed") return;
        if (!markExplained(reason)) return;
        const description =
            reason === "gpuCrashed"
                ? t("field.quality.gpuCrashed")
                : t(
                      isWebBuild
                          ? "field.quality.software.web"
                          : "field.quality.software.desktop",
                  );
        toast.warning(t("field.quality.title"), {
            id: "field-quality",
            description,
            duration: Infinity,
            action: {
                label: t("field.quality.dismiss"),
                onClick: () => {},
            },
        });
    }, [reason, t]);
}

/**
 * Shown in place of the field when there's no WebGL to draw it with: says why
 * and how to turn graphics on, instead of crashing the app.
 */
export function FieldUnavailable({ onRetry }: { onRetry: () => void }) {
    return (
        <div
            className="flex h-full w-full items-center justify-center p-24"
            data-testid="fieldUnavailable"
            role="alert"
        >
            <div className="bg-modal border-stroke rounded-6 flex max-w-[32rem] flex-col gap-12 border p-20">
                <h2 className="text-h4 text-text">
                    <T keyName="field.quality.unavailable.title" />
                </h2>
                <p className="text-body text-text-subtitle">
                    <T
                        keyName={
                            isWebBuild
                                ? "field.quality.unavailable.web"
                                : "field.quality.unavailable.desktop"
                        }
                    />
                </p>
                <div>
                    <Button size="compact" onClick={onRetry}>
                        <T keyName="field.quality.unavailable.retry" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
