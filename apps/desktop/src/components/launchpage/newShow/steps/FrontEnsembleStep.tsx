import { useEffect, useRef } from "react";
import { useTranslate } from "@tolgee/react";
import PitPresetCards from "@/components/frontEnsemble/PitPresetCards";
import type { NewShowFrontEnsembleData } from "../../newShowTypes";

interface FrontEnsembleStepProps {
    frontEnsemble: NewShowFrontEnsembleData | null;
    onChange: (frontEnsemble: NewShowFrontEnsembleData) => void;
}

/**
 * The new show's Front ensemble step: None, Small, Medium or Large, each pictured from above. A
 * size is placed with its players when the show is made; None (the default) places nothing.
 */
export default function FrontEnsembleStep({
    frontEnsemble,
    onChange,
}: FrontEnsembleStepProps) {
    const { t } = useTranslate();
    const size = frontEnsemble?.size ?? null;

    const hasSyncedInitial = useRef(frontEnsemble !== null);
    useEffect(() => {
        if (hasSyncedInitial.current) return;
        hasSyncedInitial.current = true;
        onChange({ size: null });
    }, [onChange]);

    return (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-12">
            <PitPresetCards
                value={size}
                onChange={(next) => onChange({ size: next })}
                aria-label={t("launchpage.newShow.steps.frontEnsemble.title")}
            />
            <p className="text-sub text-text-subtitle">
                {t("launchpage.newShow.steps.frontEnsemble.hint")}
            </p>
        </div>
    );
}
