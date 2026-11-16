import { BugBeetleIcon } from "@phosphor-icons/react/dist/ssr";
import { useTranslate } from "@tolgee/react";
import { siteUrl } from "@/global/siteUrl";
import { runAction } from "@/shortcuts/registry";
import { canSendReports } from "@/feedback/openReport";

export default function BugReport() {
    const { t } = useTranslate();
    const handleClick = () => {
        // The report form (fork #801); web builds that can't sign in keep the guide
        if (canSendReports) {
            runAction("reportFeedback");
            return;
        }
        const url = siteUrl("/guides/submitting-feedback/");
        if (window.electron?.openExternal) {
            // recommended way to open external links in the default browser in electron
            void window.electron.openExternal(url);
        } else {
            // This is a fallback for when the electron.openExternal function is not available
            window.open(url, "_blank");
        }
    };

    return (
        <button
            type="button"
            className="hover:text-accent text-sub touch:min-h-44 touch:min-w-44 touch:justify-center flex cursor-pointer items-center gap-4 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:opacity-5"
            onClick={handleClick}
            aria-label={t("titlebar.bugReport")}
            title={t("titlebar.bugReport")}
        >
            <BugBeetleIcon size={16} />
            {/* Icon only on narrow screens (a tablet in portrait) */}
            <span aria-hidden className="hidden lg:inline">
                {t("titlebar.bugReport")}
            </span>
        </button>
    );
}
