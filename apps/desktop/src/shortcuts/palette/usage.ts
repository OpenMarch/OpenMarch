/* cspell:words frecency */
/**
 * How often and how recently each palette item was run ("frecency"), kept per device in localStorage.
 * Used to put the commands someone actually uses at the top of the palette.
 */
const STORAGE_KEY = "openmarch:paletteUsage";
const MAX_ENTRIES = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Usage {
    count: number;
    lastUsed: number;
}

type UsageMap = Record<string, Usage>;

function load(): UsageMap {
    try {
        const parsed: unknown = JSON.parse(
            localStorage.getItem(STORAGE_KEY) ?? "{}",
        );
        return parsed && typeof parsed === "object" ? (parsed as UsageMap) : {};
    } catch {
        return {};
    }
}

export function recordPaletteUsage(id: string, now = Date.now()): void {
    const usage = load();
    usage[id] = { count: (usage[id]?.count ?? 0) + 1, lastUsed: now };
    // Keep the most recent entries so the map can't grow without bound.
    const trimmed = Object.fromEntries(
        Object.entries(usage)
            .sort(([, a], [, b]) => b.lastUsed - a.lastUsed)
            .slice(0, MAX_ENTRIES),
    );
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
        // Storage full or unavailable: ranking just falls back to the defaults.
    }
}

/** Use count weighted by recency buckets, like browser frecency. 0 for never used. */
function scoreOf(usage: Usage | undefined, now: number): number {
    if (!usage) return 0;
    const age = now - usage.lastUsed;
    const weight =
        age < 4 * DAY_MS
            ? 100
            : age < 14 * DAY_MS
              ? 70
              : age < 31 * DAY_MS
                ? 50
                : age < 90 * DAY_MS
                  ? 30
                  : 10;
    return usage.count * weight;
}

/** Frecency scores for every recorded item, read once per palette open. */
export function getPaletteUsageScores(now = Date.now()): Map<string, number> {
    return new Map(
        Object.entries(load()).map(([id, usage]) => [id, scoreOf(usage, now)]),
    );
}
