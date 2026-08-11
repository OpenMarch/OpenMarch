export const SELECT_TAB_RECENTS_STORAGE_KEY = "openmarch-select-tab-recents";
export const DEFAULT_MAX_VISIBLE_CHIPS = 6;

export type RecentsByCategory = Record<string, string[]>;

/** Prepend `id` (LIFO), drop duplicates, and cap at `max`. */
export function pushRecentId(
    ids: string[],
    id: string,
    max = DEFAULT_MAX_VISIBLE_CHIPS,
): string[] {
    return [id, ...ids.filter((existing) => existing !== id)].slice(0, max);
}

/**
 * Resolve stored recent ids against the current item list.
 * Stale ids are skipped. If nothing valid remains, fall back to the first `maxVisible` items.
 */
export function resolveRecentItems<T>(
    items: T[],
    recentIds: string[],
    getId: (item: T) => string | number,
    maxVisible = DEFAULT_MAX_VISIBLE_CHIPS,
): T[] {
    const byId = new Map(items.map((item) => [String(getId(item)), item]));
    const recents: T[] = [];
    for (const id of recentIds) {
        const item = byId.get(id);
        if (item !== undefined) {
            recents.push(item);
            if (recents.length >= maxVisible) break;
        }
    }
    if (recents.length === 0) return items.slice(0, maxVisible);
    return recents;
}

export function readRecentIds(category: string): string[] {
    try {
        const stored = localStorage.getItem(SELECT_TAB_RECENTS_STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored) as RecentsByCategory;
        const ids = parsed[category];
        if (!Array.isArray(ids)) return [];
        return ids.filter((id): id is string => typeof id === "string");
    } catch (error) {
        console.error(
            "Failed to load select tab recents from localStorage:",
            error,
        );
        return [];
    }
}

export function writeRecentIds(category: string, ids: string[]): void {
    try {
        let parsed: RecentsByCategory = {};
        const stored = localStorage.getItem(SELECT_TAB_RECENTS_STORAGE_KEY);
        if (stored) {
            try {
                const existing = JSON.parse(stored) as RecentsByCategory;
                if (existing && typeof existing === "object") {
                    parsed = existing;
                }
            } catch {
                parsed = {};
            }
        }
        parsed[category] = ids;
        localStorage.setItem(
            SELECT_TAB_RECENTS_STORAGE_KEY,
            JSON.stringify(parsed),
        );
    } catch (error) {
        console.error(
            "Failed to save select tab recents to localStorage:",
            error,
        );
    }
}
