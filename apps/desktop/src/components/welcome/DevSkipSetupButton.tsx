import { Button } from "@openmarch/ui";
import { twMerge } from "tailwind-merge";
import { FastForwardIcon } from "@phosphor-icons/react";
import { isDevBuild } from "@/utilities/devBuild";

/**
 * Skips the welcome flow in developer builds (see `isDevBuild`: dev servers and
 * the dev, preview and nightly web channels). Not part of the released app: it
 * renders nothing in stable, lab or packaged builds, and its text is not translated.
 */
export default function DevSkipSetupButton({
    onSkip,
    disabled,
    className,
}: {
    onSkip: () => void;
    disabled?: boolean;
    className?: string;
}) {
    if (!isDevBuild) return null;
    return (
        // i18n-ignore: developer tool, only in dev, preview and nightly builds (never stable, lab or packaged)
        <Button
            variant="ghost"
            size="compact"
            onClick={onSkip}
            disabled={disabled}
            className={twMerge(
                "border-stroke text-text-subtitle hover:text-text gap-6 border border-dashed",
                className,
            )}
            title="Developer builds only: saves Expert mode and skips the rest of setup"
            data-testid="welcome-dev-skip"
        >
            <FastForwardIcon size={14} />
            <span className="text-sub">Skip setup</span>
            <span className="bg-yellow rounded-full px-6 text-[10px] leading-[16px] font-medium tracking-wide text-black uppercase">
                Dev only
            </span>
        </Button>
    );
}
