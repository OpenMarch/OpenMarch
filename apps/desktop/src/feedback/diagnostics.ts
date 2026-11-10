/**
 * What the app did just before someone reported a bug (fork #801): the last
 * few hundred actions, errors and console lines, kept in memory and sent only
 * with a report. Actions are recorded by id, never with their arguments,
 * which can hold typed text.
 */
export type DiagnosticKind =
    | "action"
    | "error"
    | "rejection"
    | "console.error"
    | "console.warn"
    | "console.log";

export interface DiagnosticEntry {
    /** Milliseconds since the epoch */
    readonly at: number;
    readonly kind: DiagnosticKind;
    readonly text: string;
}

/** Longest text kept per entry; stacks and objects past this are cut. */
export const MAX_ENTRY_LENGTH = 2000;
export const DEFAULT_CAPACITY = 500;

export interface DiagnosticsLog {
    push(kind: DiagnosticKind, text: string): void;
    /** Oldest first */
    entries(): DiagnosticEntry[];
}

export function createDiagnosticsLog(
    capacity = DEFAULT_CAPACITY,
    now: () => number = Date.now,
): DiagnosticsLog {
    const ring: DiagnosticEntry[] = [];
    let next = 0;
    return {
        push(kind, text) {
            const entry = {
                at: now(),
                kind,
                text:
                    text.length > MAX_ENTRY_LENGTH
                        ? `${text.slice(0, MAX_ENTRY_LENGTH)}…`
                        : text,
            };
            if (ring.length < capacity) ring.push(entry);
            else ring[next] = entry;
            next = (next + 1) % capacity;
        },
        entries() {
            return ring.length < capacity
                ? [...ring]
                : [...ring.slice(next), ...ring.slice(0, next)];
        },
    };
}

/** One console argument or thrown value as text. */
export function describeValue(value: unknown): string {
    if (value instanceof Error)
        return value.stack ?? `${value.name}: ${value.message}`;
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

type ConsoleLike = Pick<Console, "error" | "warn" | "log">;

export interface DiagnosticsSources {
    console: ConsoleLike;
    /** Where `error` and `unhandledrejection` events arrive (the window) */
    events: Pick<EventTarget, "addEventListener" | "removeEventListener">;
    /** `subscribeToActionRuns` from the shortcuts registry */
    subscribeToActions: (listener: (id: string) => void) => () => void;
}

/**
 * Starts recording into `log`. Console methods keep working as before; they
 * are wrapped, not replaced. Returns a function that stops recording.
 */
export function installDiagnostics(
    log: DiagnosticsLog,
    sources: DiagnosticsSources,
): () => void {
    const { console: target } = sources;
    const originals = {
        error: target.error,
        warn: target.warn,
        log: target.log,
    };
    for (const method of ["error", "warn", "log"] as const) {
        const original = originals[method];
        target[method] = (...args: unknown[]) => {
            log.push(`console.${method}`, args.map(describeValue).join(" "));
            original.apply(target, args);
        };
    }

    const onError = (event: Event) => {
        const e = event as ErrorEvent;
        log.push("error", describeValue(e.error ?? e.message));
    };
    const onRejection = (event: Event) => {
        log.push(
            "rejection",
            describeValue((event as PromiseRejectionEvent).reason),
        );
    };
    sources.events.addEventListener("error", onError);
    sources.events.addEventListener("unhandledrejection", onRejection);
    const stopActions = sources.subscribeToActions((id) =>
        log.push("action", id),
    );

    return () => {
        Object.assign(target, originals);
        sources.events.removeEventListener("error", onError);
        sources.events.removeEventListener("unhandledrejection", onRejection);
        stopActions();
    };
}
