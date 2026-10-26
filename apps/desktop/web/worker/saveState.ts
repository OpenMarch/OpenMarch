/**
 * Whether the open show has changes its stored copy doesn't: from the copy's
 * path and change count, and the show's path and change count now. True
 * from the moment of the change, while the save waits on its short delay or
 * on a transaction to finish, so the page can warn before it's closed.
 */
export function hasUnsavedChanges(
    saved: { path: string; changes: number } | null,
    path: string,
    changes: number,
): boolean {
    return saved?.path !== path || saved.changes !== changes;
}
