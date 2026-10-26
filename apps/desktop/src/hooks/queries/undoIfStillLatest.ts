/**
 * For a "you just did X — Undo" button: runs `undo` only while X is still
 * the newest history entry, i.e. the latest-entry token still equals the one
 * taken right after X. Otherwise (something else was edited, or X was
 * already undone) the generic Undo would revert something else, so it calls
 * `unavailable` instead. Returns whether it undid. Run it inside
 * queueHistoryStep so no other undo can land between the check and `undo`.
 */
export async function undoIfStillLatest({
    token,
    getLatestToken,
    undo,
    unavailable,
}: {
    token: string | null;
    getLatestToken: () => Promise<string | null>;
    /** Resolves whether it undid anything */
    undo: () => Promise<boolean>;
    unavailable: () => void;
}): Promise<boolean> {
    const latest = token === null ? null : await getLatestToken();
    if (token !== null && latest === token) return await undo();
    unavailable();
    return false;
}
