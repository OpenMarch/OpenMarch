import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { T } from "@tolgee/react";
import ActionButton from "@/shortcuts/ActionButton";
import { holdTerms } from "@/timeline/holdTerms";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { allMarchersQueryOptions } from "@/hooks/queries";
import {
    useClearPageLabels,
    useClearPagePage,
} from "@/timeline/timelineClearPage";

/**
 * **Clear Page N** and, when later pages would move back, **Clear Page N, Pages N–M move back
 * too** (#573), for all marchers (the Alignment tab's "Place all marchers ▾") or the selected ones
 * (the inspector's "Place selected marchers ▾"). Mounted inside the open menu, so the follow-back
 * check runs only while it shows; the command palette reads the follow-back label only when it
 * opens (`clearPageFollowBackReader`).
 */
export default function ClearPageMenuItems({
    scope,
    onRun,
    className,
}: {
    scope: "all" | "selected";
    onRun: () => void;
    className: string;
}) {
    const selectedPage = useSelectedPage()?.selectedPage ?? null;
    const selection = useSelectedMarchers()?.selectedMarchers;
    const { data: performers } = useQuery({
        ...allMarchersQueryOptions(),
        enabled: scope === "all",
    });
    const marcherIds = useMemo(
        () =>
            ((scope === "all" ? performers : selection) ?? []).map((m) => m.id),
        [scope, performers, selection],
    );
    const page = useClearPagePage(selectedPage);
    const labels = useClearPageLabels(page, marcherIds);
    return (
        <>
            <ActionButton
                action={
                    scope === "all"
                        ? "setAllMarchersToPreviousPage"
                        : "setSelectedMarchersToPreviousPage"
                }
                onRun={onRun}
                className={className}
                data-testid={`clear-page-${scope}`}
            >
                {labels ? (
                    labels.clear
                ) : (
                    <T
                        keyName="toolbar.alignment.clearThisPage"
                        params={holdTerms()}
                    />
                )}
            </ActionButton>
            {labels?.followBack && (
                <ActionButton
                    action={
                        scope === "all"
                            ? "setAllMarchersToPreviousPageAndFollowing"
                            : "setSelectedMarchersToPreviousPageAndFollowing"
                    }
                    onRun={onRun}
                    className={className}
                    data-testid={`clear-page-${scope}-follow-back`}
                >
                    {labels.followBack}
                </ActionButton>
            )}
        </>
    );
}
