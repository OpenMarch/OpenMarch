/**
 * Usage analytics: which actions people use and how they reach them, and where they get stuck.
 * Sent to PostHog only when the person opted in (PostHog drops `capture` otherwise).
 *
 * Kept small on purpose, so it costs little and holds no show content:
 * - `actions used`: one event per session window (every few minutes and when the window goes
 *   away) with how often each action ran, how often by key, and which actions were undone right
 *   after they ran. Never one event per action.
 * - `action refused`: someone tried an action that can't run now; carries the reason shown.
 * - `palette search found nothing`: a command palette search with no results.
 */
import type { ActionRunSource } from "@/shortcuts/registry";

/**
 * Sends an event. `sendNow` means the window was hidden and may be about to close (quitting hides
 * it first): send it at once rather than in the next batch.
 */
export type CaptureFn = (
    event: string,
    properties: Record<string, unknown>,
    options?: { sendNow?: boolean },
) => void;

/** How long after an action an undo counts as undoing it. */
export const QUICK_UNDO_MS = 5_000;
/** The same refusal again within this time isn't sent again (held keys, repeated clicks). */
export const REFUSAL_REPEAT_MS = 10_000;
/** At most this many refusal events per window load. */
export const MAX_REFUSALS = 30;
/** At most this many palette searches per window load. */
export const MAX_EMPTY_SEARCHES = 20;
/** Longer texts are cut to this length. */
const MAX_TEXT = 120;

const UNDO = "performUndo";
const REDO = "performRedo";

/**
 * A palette search with only the words the app's own text uses ("rotate", "mirror", "tempo");
 * every other word (a marcher's name, a show title, a label like "B12") becomes `*`. Says what
 * was looked for without naming people, shows or places.
 */
export function redactSearch(
    query: string,
    isKnownWord: (word: string) => boolean,
): string {
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word !== "")
        .map((word) => (isKnownWord(word) ? word : "*"))
        .join(" ");
}

/** The words (letters only, two or more, lowercased) in every string of a translation file. */
export function wordsOf(
    value: unknown,
    words = new Set<string>(),
): Set<string> {
    if (typeof value === "string") {
        for (const word of value.toLowerCase().match(/\p{L}{2,}/gu) ?? [])
            words.add(word);
    } else if (value && typeof value === "object") {
        for (const item of Object.values(value)) wordsOf(item, words);
    }
    return words;
}

function clip(text: string): string {
    const trimmed = text.trim();
    return trimmed.length > MAX_TEXT ? trimmed.slice(0, MAX_TEXT) : trimmed;
}

function bump(counts: Record<string, number>, key: string) {
    counts[key] = (counts[key] ?? 0) + 1;
}

export interface UsageTracker {
    actionRan(id: string, source: ActionRunSource): void;
    actionRefused(id: string, source: ActionRunSource, reason: string): void;
    paletteSearchFoundNothing(query: string): void;
    /** Sends the counts gathered so far, if any, and starts a new window (`sendNow`: see `CaptureFn`). */
    flush(sendNow?: boolean): void;
}

/**
 * `isEdit` says which actions change the show: only those can be "undone quickly", so opening the
 * palette or pressing play between an edit and its undo doesn't take the blame. An edit made by
 * dragging on the field isn't an action, so an undo of it can still be put on the action before.
 */
export function createUsageTracker(
    capture: CaptureFn,
    now: () => number = Date.now,
    isEdit: (id: string) => boolean = () => true,
    isKnownWord: (word: string) => boolean = () => false,
): UsageTracker {
    let actions: Record<string, number> = {};
    let byKey: Record<string, number> = {};
    let sources: Record<string, number> = {};
    let undoneQuickly: Record<string, number> = {};
    let windowStart = now();
    let last: { id: string; at: number } | null = null;
    const lastRefusal = new Map<string, number>();
    let refusalsSent = 0;
    const searchesSent = new Set<string>();

    return {
        actionRan(id, source) {
            bump(actions, id);
            bump(sources, source);
            if (source === "key") bump(byKey, id);
            const at = now();
            if (id === UNDO) {
                if (last && at - last.at <= QUICK_UNDO_MS)
                    bump(undoneQuickly, last.id);
                last = null;
            } else if (id !== REDO && isEdit(id)) {
                last = { id, at };
            }
        },
        actionRefused(id, source, reason) {
            const at = now();
            const key = `${id}\u0000${source}`;
            const previous = lastRefusal.get(key);
            if (previous !== undefined && at - previous < REFUSAL_REPEAT_MS)
                return;
            lastRefusal.set(key, at);
            if (refusalsSent >= MAX_REFUSALS) return;
            refusalsSent += 1;
            capture("action refused", {
                action: id,
                source,
                reason: clip(reason),
            });
        },
        paletteSearchFoundNothing(query) {
            if (query.trim().length < 2) return;
            const text = clip(redactSearch(query, isKnownWord));
            if (searchesSent.has(text)) return;
            if (searchesSent.size >= MAX_EMPTY_SEARCHES) return;
            searchesSent.add(text);
            capture("palette search found nothing", { query: text });
        },
        flush(sendNow = false) {
            const total = Object.values(actions).reduce((a, b) => a + b, 0);
            const at = now();
            if (total > 0)
                capture(
                    "actions used",
                    {
                        actions,
                        actions_by_key: byKey,
                        sources,
                        undone_quickly: undoneQuickly,
                        total_actions: total,
                        window_seconds: Math.round((at - windowStart) / 1000),
                    },
                    { sendNow },
                );
            actions = {};
            byKey = {};
            sources = {};
            undoneQuickly = {};
            windowStart = at;
        },
    };
}

let installed: UsageTracker | null = null;

/** The app's own words, for `redactSearch`; empty until `setKnownWords`. */
let knownWords: ReadonlySet<string> = new Set();

/** Sets the words a palette search may keep (the app's English text). */
export function setKnownWords(words: ReadonlySet<string>): void {
    knownWords = words;
}

/** The tracker `installUsageEvents` set up, or null (tests, web build, no analytics key). */
export function usageTracker(): UsageTracker | null {
    return installed;
}

/** A palette search that found nothing; no-op until `installUsageEvents` runs. */
export function reportPaletteSearchFoundNothing(query: string): void {
    installed?.paletteSearchFoundNothing(query);
}

/** How often the action counts are sent while the window stays open. */
export const FLUSH_EVERY_MS = 5 * 60_000;

/**
 * Starts usage analytics for this window: counts action runs and refusals from the shortcuts
 * registry and sends the counts every few minutes and when the window is hidden or closes.
 */
export function installUsageEvents(
    capture: CaptureFn,
    isEdit: (id: string) => boolean,
    registry: {
        subscribeToActionRuns: (
            listener: (id: string, source: ActionRunSource) => void,
        ) => () => void;
        subscribeToActionRefusals: (
            listener: (
                id: string,
                source: ActionRunSource,
                reason: string,
            ) => void,
        ) => () => void;
    },
): () => void {
    const tracker = createUsageTracker(capture, Date.now, isEdit, (word) =>
        knownWords.has(word),
    );
    installed = tracker;
    const stopRuns = registry.subscribeToActionRuns((id, source) =>
        tracker.actionRan(id, source),
    );
    const stopRefusals = registry.subscribeToActionRefusals(
        (id, source, reason) => tracker.actionRefused(id, source, reason),
    );
    const timer = setInterval(() => tracker.flush(), FLUSH_EVERY_MS);
    const onHidden = () => {
        if (document.visibilityState === "hidden") tracker.flush(true);
    };
    // In the capture phase, so it runs before PostHog's own pagehide handler, which sends the
    // queue by beacon as the page goes (each show open or close reloads the window)
    const onPageHide = () => tracker.flush();
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide, { capture: true });
    return () => {
        tracker.flush();
        stopRuns();
        stopRefusals();
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onHidden);
        window.removeEventListener("pagehide", onPageHide, { capture: true });
        if (installed === tracker) installed = null;
    };
}
