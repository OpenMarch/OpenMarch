import { PlusIcon } from "@phosphor-icons/react";
import { useTolgee } from "@tolgee/react";
import { useAddPage } from "./PageTimeline.utils";

/**
 * The touch layout's New page button. It sits in the timeline's label
 * column (where "Pages" is with a mouse), so it has its own space, never
 * covers a page box and stays in view however far the timeline scrolls.
 * In a narrow timeline only the + shows.
 */
export default function NewPageButton() {
    const { t } = useTolgee();
    const { addPage, canAddPage } = useAddPage();
    const label = t("timeline.page.add");
    return (
        <button
            type="button"
            className="bg-accent text-sub text-text-invert flex h-44 w-full min-w-44 cursor-pointer items-center justify-center gap-4 rounded-full px-8 font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => addPage()}
            disabled={!canAddPage}
            aria-label={label}
            title={label}
            data-testid="add-page"
        >
            <PlusIcon size={18} className="shrink-0" />
            <span className="@max-[360px]:hidden">{label}</span>
        </button>
    );
}
