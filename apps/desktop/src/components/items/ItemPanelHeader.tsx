import { CaretLeftIcon, XIcon } from "@phosphor-icons/react";
import { useTranslate } from "@tolgee/react";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";

/**
 * The header of the Props and Front ensemble panels: the title, a back button when `onBack` is
 * given, any `actions` (buttons beside the close button), and the close button.
 */
export default function ItemPanelHeader({
    title,
    onBack,
    actions,
}: {
    title: React.ReactNode;
    onBack?: () => void;
    actions?: React.ReactNode;
}) {
    const { t } = useTranslate();
    const { toggleOpen } = useSidebarModalStore();
    return (
        <header className="flex items-center justify-between gap-24">
            <div className="flex items-center gap-8">
                {onBack && (
                    <button
                        onClick={onBack}
                        aria-label={t("props.back")}
                        title={t("props.back")}
                        className="hover:text-accent duration-150 ease-out"
                    >
                        <CaretLeftIcon size={24} />
                    </button>
                )}
                <h4 className="text-h4 leading-none">{title}</h4>
            </div>
            <div className="flex items-center gap-8">
                {actions}
                <button
                    onClick={toggleOpen}
                    aria-label={t("props.close")}
                    title={t("props.close")}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </div>
        </header>
    );
}
