import { usePathPenStore, type PathSession } from "./pathPenStore";

/**
 * The line the Follow tool is open on (pathways step 4d), whose marchers stay in focus while
 * everyone else fades, as the shape tool fades them; null when it's closed. The same array while
 * the drawing changes, so the fade isn't set again on every pointer move.
 */
export const followFocusOf = (
    session: PathSession | null,
): readonly number[] | null =>
    session?.phase === "drawing" && session.follow ? session.follow.ids : null;

/** {@link followFocusOf} for the open session */
export const useFollowFocus = (): readonly number[] | null =>
    usePathPenStore((s) => followFocusOf(s.session));
