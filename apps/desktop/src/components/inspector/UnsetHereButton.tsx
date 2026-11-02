import clsx from "clsx";
import { useTranslate } from "@tolgee/react";
import { getButtonClassName } from "@openmarch/ui";
import ActionButton from "@/shortcuts/ActionButton";
import {
    unsetFollowingLabel,
    useUnsetFollowingPages,
    useUnsetTargets,
} from "@/timeline/timelineUnset";
import { useTimelineResolverStore } from "@/timeline/timelineStore";

/**
 * **Unset here** in the marcher inspector (Set vs Following, #304), in timeline mode: runs the
 * `timelineUnsetHere` action, so it's disabled when no selected marcher is Set on the count shown.
 * The tooltip says whom it takes back when only some of the selection is Set.
 */
export default function UnsetHereButton({
    marcherIds,
}: {
    marcherIds: readonly number[];
}) {
    const { t } = useTranslate();
    const timelineMode = useTimelineResolverStore((s) => s.resolver !== null);
    const targets = useUnsetTargets(marcherIds);
    if (!timelineMode || marcherIds.length === 0) return null;
    const tooltip =
        targets.length === 0
            ? t("inspector.marcher.timeline.unsetHereNone", {
                  defaultValue:
                      "None of the selected marchers has a keyframe on this count",
              })
            : targets.length === marcherIds.length
              ? t("inspector.marcher.timeline.unsetHereHint", {
                    defaultValue:
                        "Remove their keyframe on this count, so they follow from earlier. Later pages stay where they are",
                })
              : t("inspector.marcher.timeline.unsetHereHintSome", {
                    defaultValue:
                        "Remove the keyframe of the {count} of the {total} selected that have one on this count, so they follow from earlier. Later pages stay where they are",
                    count: String(targets.length),
                    total: String(marcherIds.length),
                });
    return (
        <ActionButton
            action="timelineUnsetHere"
            data-testid="timeline-unset-here"
            tooltip={tooltip}
            aria-label={t("inspector.marcher.timeline.buttonWithHint", {
                label: t("inspector.marcher.timeline.unsetHere", {
                    defaultValue: "Remove keyframe",
                }),
                hint: tooltip,
            })}
            className={clsx(
                getButtonClassName({ variant: "secondary", size: "compact" }),
            )}
        >
            {t("inspector.marcher.timeline.unsetHere", {
                defaultValue: "Remove keyframe",
            })}
        </ActionButton>
    );
}

/**
 * **Unset here and on Pages N–M** in the marcher inspector (Set vs Following, #305), next to
 * **Unset here**: runs the `timelineUnsetHereAndFollowing` action. Shown only when some later
 * pages follow the spot of the selected marchers Set on the count shown, and it names them.
 */
export function UnsetHereAndFollowingButton({
    marcherIds,
}: {
    marcherIds: readonly number[];
}) {
    const { t } = useTranslate();
    const targets = useUnsetTargets(marcherIds);
    const following = useUnsetFollowingPages(marcherIds);
    if (!following) return null;
    const label = unsetFollowingLabel(following, (key, defaultValue, params) =>
        t(key, { defaultValue, ...params }),
    );
    const pageArgs = {
        pageCount: following.length,
        first: following[0] ?? "",
        last: following[following.length - 1] ?? "",
    };
    const tooltip =
        targets.length === marcherIds.length
            ? t("inspector.marcher.timeline.unsetHereAndFollowingHint", {
                  defaultValue:
                      "Remove their keyframe on this count, and {pageCount, plural, =1 {Page {first} follows} other {Pages {first}–{last} follow}} back to the keyframe before it",
                  ...pageArgs,
              })
            : t("inspector.marcher.timeline.unsetHereAndFollowingHintSome", {
                  defaultValue:
                      "Remove the keyframe of the {count} of the {total} selected that have one on this count, and {pageCount, plural, =1 {Page {first} follows} other {Pages {first}–{last} follow}} back to the keyframe before it",
                  count: String(targets.length),
                  total: String(marcherIds.length),
                  ...pageArgs,
              });
    return (
        <ActionButton
            action="timelineUnsetHereAndFollowing"
            data-testid="timeline-unset-here-and-following"
            tooltip={tooltip}
            aria-label={t("inspector.marcher.timeline.buttonWithHint", {
                label,
                hint: tooltip,
            })}
            className={clsx(
                getButtonClassName({ variant: "secondary", size: "compact" }),
            )}
        >
            {label}
        </ActionButton>
    );
}
