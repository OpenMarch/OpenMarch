import clsx from "clsx";
import { PathIcon, PenNibIcon } from "@phosphor-icons/react";
import tolgee from "@/global/singletons/Tolgee";
import ActionButton from "@/shortcuts/ActionButton";
import { Tip } from "@/components/ui/Tip";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { usePathPenStore } from "./pathPenStore";
import { penRefusal } from "./usePathPen";
import { useFollowTheLeader } from "./followTheLeader";
import { useOrderHoverProps } from "./marcherOrderStore";

const BUTTON =
    "enabled:hover:text-accent flex items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The toolbar's Path pen (pathways step 1): runs `pathPen` (P), lit while it draws. With no marcher
 * selected it's greyed and its tooltip says why; with several it draws a group path (step 15).
 * Follow beside it only with Follow-the-leader on (#1095).
 */
export function PathPenButton({ performers }: { performers: number }) {
    // Lit for the kind being drawn: a path, or a trail (Follow, pathways step 4)
    const drawing = usePathPenStore(
        (s) => s.session?.phase === "drawing" && !s.session.target.trail,
    );
    const following = usePathPenStore(
        (s) => s.session?.phase === "drawing" && !!s.session.target.trail,
    );
    const followLabel = tolgee.t("actions.path.follow", "Follow");
    const refusal = penRefusal(performers);
    const label = tolgee.t("actions.path.pen", "Path pen");
    const followTheLeader = useFollowTheLeader();
    // Pointing at Follow shows who will lead
    const orderHover = useOrderHoverProps();
    return (
        <ToolbarSection aria-label={label}>
            <Tip
                label={refusal ? `${label}: ${refusal}` : label}
                action={refusal ? undefined : "pathPen"}
            >
                <span>
                    <ActionButton
                        action="pathPen"
                        tooltip=""
                        disabled={refusal !== null}
                        aria-pressed={drawing}
                        aria-label={label}
                        data-testid="toolbar-path-pen"
                        className={clsx(
                            BUTTON,
                            drawing ? "text-accent" : "text-text",
                        )}
                    >
                        <PenNibIcon size={22} />
                        {tolgee.t("pathways.toolbar.path", "Path")}
                    </ActionButton>
                </span>
            </Tip>
            {followTheLeader && (
                <Tip
                    label={
                        performers < 2
                            ? `${followLabel}: ${tolgee.t(
                                  "pathways.refusals.followTwo",
                                  "Select the marchers of a line (two or more) to follow a trail",
                              )}`
                            : tolgee.t(
                                  "pathways.toolbar.followTip",
                                  "Follow: drag a trail out of an end of the selected line, and where the line stops becomes its next spots",
                              )
                    }
                    action={performers < 2 ? undefined : "followTrail"}
                >
                    <span {...orderHover}>
                        <ActionButton
                            action="followTrail"
                            tooltip=""
                            disabled={performers < 2}
                            aria-pressed={following}
                            aria-label={followLabel}
                            data-testid="toolbar-follow-trail"
                            className={clsx(
                                BUTTON,
                                following ? "text-accent" : "text-text",
                            )}
                        >
                            <PathIcon size={22} />
                            {followLabel}
                        </ActionButton>
                    </span>
                </Tip>
            )}
        </ToolbarSection>
    );
}
