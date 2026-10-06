/**
 * Calls `apply` when another window changes `key` in localStorage. The browser only fires
 * `storage` in windows other than the writer, so applying never echoes back.
 */
export function syncFromStorage<T>(
    key: string,
    parse: (raw: string) => T,
    apply: (value: T) => void,
): () => void {
    const onStorage = (event: StorageEvent) => {
        if (event.key !== key || event.newValue === null) return;
        try {
            apply(parse(event.newValue));
        } catch (error) {
            console.error(
                `Ignoring unreadable ${key} from another window:`,
                error,
            );
        }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
}
