import { PlusIcon } from "@phosphor-icons/react";
import { useTolgee } from "@tolgee/react";
import { useAddPage } from "./PageTimeline.utils";

/**
 * The touch layout's New page button. It has its own slot after the pages
 * strip, outside the scrolling strip, so it never covers a page box and stays in
 * view however far the timeline scrolls. In a narrow timeline only the +
 * shows.
 */
export default function NewPageButton() {
    const { t } = useTolgee();
    const { addPage, canAddPage } = useAddPage();
    const label = t("timeline.page.add");
    return (
        <button
            type="button"
            className="bg-accent text-sub text-text-invert flex h-44 min-w-44 cursor-pointer items-center justify-center gap-4 rounded-full px-12 font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 @max-[420px]:px-0"
            onClick={() => addPage()}
            disabled={!canAddPage}
            aria-label={label}
            title={label}
            data-testid="add-page"
        >
            <PlusIcon size={18} className="shrink-0" />
            <span className="@max-[420px]:hidden">{label}</span>
        </button>
    );
}
