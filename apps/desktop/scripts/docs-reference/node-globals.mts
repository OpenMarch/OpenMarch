/* global globalThis -- Node 24 has it; this file runs only in Node */
// Browser globals the app's stores touch when imported. Imported first by generate.mts.
const memory = new Map<string, string>();
globalThis.localStorage ??= {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, String(v)),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
        return memory.size;
    },
} as Storage;
