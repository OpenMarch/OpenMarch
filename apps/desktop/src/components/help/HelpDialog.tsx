import { useState } from "react";
import { useTolgee } from "@tolgee/react";
import {
    ArrowSquareOutIcon,
    BookOpenIcon,
    BugBeetleIcon,
    CheckIcon,
    CopyIcon,
    SparkleIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    TextArea,
} from "@openmarch/ui";
import { version } from "../../../package.json";
import { SITE_URL, siteUrl } from "@/global/siteUrl";
import { useHelpDialogStore } from "@/stores/HelpDialogStore";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { isWebBuild } from "@/utilities/webBuild";
import { runAction } from "@/shortcuts/registry";
import { canSendReports } from "@/feedback/openReport";
import { helpPrompt, helpSystem, languageName } from "./helpPrompt";

/** Opens a web page in the default browser (desktop) or a new tab (web editor). */
function openPage(url: string) {
    if (window.electron?.openExternal) void window.electron.openExternal(url);
    else window.open(url, "_blank", "noopener");
}

const sectionClass =
    "rounded-6 border-stroke flex flex-col items-start gap-8 border p-16";
/** A one-line section: its heading and text on the left, its button on the right. */
const rowClass =
    "rounded-6 border-stroke flex flex-wrap items-center justify-between gap-12 border px-16 py-12";
const headingClass = "text-body text-text flex items-center gap-6 font-medium";

/**
 * Help (the ? in the title bar, F1, or Help › Get Help…): read the user guide, copy a message
 * that has an AI assistant read the guide and answer, or report a problem. Written for band
 * directors and drill designers, most of whom aren't technical.
 */
export default function HelpDialog() {
    const open = useHelpDialogStore((s) => s.open);
    const setOpen = useHelpDialogStore((s) => s.setOpen);
    if (!open) return null;
    return (
        <Dialog open onOpenChange={setOpen}>
            <DialogContent className="max-h-[90vh] w-[min(38rem,90vw)] overflow-y-auto">
                <HelpBody close={() => setOpen(false)} />
            </DialogContent>
        </Dialog>
    );
}

function HelpBody({ close }: { close: () => void }) {
    const { t, getLanguage } = useTolgee(["language"]);
    const basic = useIsBasicMode();
    const [question, setQuestion] = useState("");
    // "copied" until the question changes; "failed" shows the message to copy by hand
    const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
    const [showMessage, setShowMessage] = useState(false);

    const message = helpPrompt({
        site: SITE_URL,
        version,
        app: isWebBuild ? "web" : "desktop",
        system: helpSystem(isWebBuild),
        mode: basic ? "Basic" : "Expert",
        language: languageName(getLanguage()),
        question,
    });

    const copyMessage = async () => {
        try {
            await navigator.clipboard.writeText(message);
            setCopy("copied");
        } catch {
            setCopy("failed");
        }
    };

    const report = () => {
        close();
        // The report form (fork #801); web builds that can't sign in get the guide's page
        if (canSendReports) runAction("reportFeedback");
        else openPage(siteUrl("/guides/start/get-help/"));
    };

    return (
        <div className="flex flex-col gap-12" data-testid="help-dialog">
            <DialogTitle>{t("help.title")}</DialogTitle>
            <DialogDescription>{t("help.description")}</DialogDescription>

            <section className={rowClass}>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <h3 className={headingClass}>
                        <BookOpenIcon size={18} aria-hidden />
                        {t("help.guide.title")}
                    </h3>
                    <p className="text-sub text-text-subtitle">
                        {t("help.guide.body")}
                    </p>
                </div>
                <Button
                    size="compact"
                    variant="secondary"
                    onClick={() => openPage(siteUrl("/guides/"))}
                >
                    {t("help.guide.open")}
                    <ArrowSquareOutIcon size={16} aria-hidden />
                </Button>
            </section>

            <section className={sectionClass}>
                <h3 className={headingClass}>
                    <SparkleIcon size={18} aria-hidden />
                    {t("help.ai.title")}
                </h3>
                <p className="text-sub text-text-subtitle">
                    {t("help.ai.body")}
                </p>
                <label className="text-sub text-text flex w-full flex-col gap-4">
                    {t("help.ai.questionLabel")}
                    <TextArea
                        autoFocus
                        value={question}
                        onChange={(e) => {
                            setQuestion(e.target.value);
                            if (copy !== "idle") setCopy("idle");
                        }}
                        placeholder={t("help.ai.questionPlaceholder")}
                        className="min-h-[48px] px-8 py-6"
                        data-testid="help-question"
                    />
                </label>
                <div className="flex flex-wrap items-center gap-12">
                    <Button
                        size="compact"
                        onClick={() => void copyMessage()}
                        data-testid="help-copy-prompt"
                    >
                        {copy === "copied" ? (
                            <CheckIcon size={16} aria-hidden />
                        ) : (
                            <CopyIcon size={16} aria-hidden />
                        )}
                        {t("help.ai.copy")}
                    </Button>
                    <button
                        type="button"
                        className="text-sub text-text-subtitle hover:text-accent cursor-pointer underline-offset-2 hover:underline"
                        aria-expanded={showMessage}
                        onClick={() => setShowMessage((s) => !s)}
                    >
                        {t("help.ai.whatIsCopied")}
                    </button>
                </div>
                <p
                    aria-live="polite"
                    className={
                        copy === "copied"
                            ? "text-sub text-text"
                            : "text-sub text-text-subtitle"
                    }
                    data-testid="help-copied"
                >
                    {copy === "copied"
                        ? t("help.ai.copied")
                        : t("help.ai.privacy")}
                </p>
                {copy === "failed" && (
                    <p className="text-sub text-text">
                        {t("help.ai.copyFailed")}
                    </p>
                )}
                {(showMessage || copy === "failed") && (
                    <TextArea
                        readOnly
                        aria-label={t("help.ai.whatIsCopied")}
                        value={message}
                        onFocus={(e) => e.currentTarget.select()}
                        className="text-sub min-h-[160px] px-8 py-6"
                    />
                )}
            </section>

            <section className={rowClass}>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <h3 className={headingClass}>
                        <BugBeetleIcon size={18} aria-hidden />
                        {t("help.report.title")}
                    </h3>
                    <p className="text-sub text-text-subtitle">
                        {t("help.report.body")}
                    </p>
                </div>
                <Button size="compact" variant="secondary" onClick={report}>
                    {t("titlebar.bugReport")}
                </Button>
            </section>
        </div>
    );
}
