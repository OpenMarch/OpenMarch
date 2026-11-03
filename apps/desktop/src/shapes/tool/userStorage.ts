import { syncFromStorage } from "@/stores/syncFromStorage";

/**
 * A list the user keeps in localStorage with the app's other per-user settings (#344): it follows
 * them from show to show and across restarts, and other windows pick up its changes.
 */
export interface UserList<T> {
    load(): T[];
    save(items: readonly T[]): void;
    /** Calls `apply` when another window changes the list */
    sync(apply: (items: T[]) => void): () => void;
}

/**
 * The list at `key`; `keep` reads one stored entry, null leaving it out. `what` names it in
 * console errors.
 */
export function userList<T>(
    key: string,
    keep: (entry: unknown) => T | null,
    what: string,
): UserList<T> {
    const parse = (raw: string): T[] => {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.flatMap((entry) => keep(entry) ?? [])
            : [];
    };
    return {
        load() {
            try {
                const stored = localStorage.getItem(key);
                return stored ? parse(stored) : [];
            } catch (error) {
                console.error(`Failed to load ${what}:`, error);
                return [];
            }
        },
        save(items) {
            try {
                localStorage.setItem(key, JSON.stringify(items));
            } catch (error) {
                console.error(`Failed to save ${what}:`, error);
            }
        },
        sync: (apply) => syncFromStorage(key, parse, apply),
    };
}
