import type { ValidationError, ValidationResult } from "@openmarch/core";
import { timelineTextForLog, type TimelineText } from "@/timeline/timelineText";

/**
 * A rejected timeline write (spec section 6). `code` is the spec's error code: `E-S1`, `E-P1`,
 * `E-D2` and `E-N2` come from the core validators and are thrown before the database is touched;
 * `E-A1`, `E-A2`, `E-A3`, `E-T1`, `E-T3`, `E-T4`, `E-T5` and `E-T6` are the invariants the
 * database enforces. Where one trigger checks two invariants and the spec's message names both
 * (`E-A1/E-A2`, `E-T3/E-T4`), `code` is that combined code: the database doesn't say which half
 * failed, so the write path doesn't guess. `E-ARGS` marks a call the write path refuses before writing (a missing row,
 * a slot count that needs destinations, and so on), and `E-DB` any other database rejection.
 *
 * A refusal for the user carries `text`, its message as a Tolgee key and arguments, which
 * `timelineErrorMessage` translates when it is shown. `message` is that key with its arguments,
 * for logs (`timelineTextForLog`): this module doesn't import Tolgee, so the convert-on-open
 * worker and the web build's worker can run the write path. A message given as a plain string is
 * for developers only.
 */
export class TimelineWriteError extends Error {
    readonly code: string;
    readonly details: ValidationError[];
    /** The message for the user, translated when shown; absent for a developer-only message */
    readonly text?: TimelineText;

    constructor(
        code: string,
        message: string | TimelineText,
        details: ValidationError[] = [],
        options?: { cause?: unknown },
    ) {
        const own =
            typeof message === "string" ? message : timelineTextForLog(message);
        super(own.startsWith("E-") ? own : `${code}: ${own}`, options);
        this.name = "TimelineWriteError";
        this.code = code;
        this.details = details;
        if (typeof message !== "string") this.text = message;
    }
}

/** Throws a `TimelineWriteError` carrying the validator's code when `result` is not ok. */
export function assertValid(result: ValidationResult, what: string): void {
    if (result.ok) return;
    const first = result.errors[0]!;
    const summary = result.errors
        .map((e) => (e.path ? `${e.path}: ${e.message}` : e.message))
        .join("; ");
    throw new TimelineWriteError(
        first.code,
        `${what} is invalid (${summary})`,
        result.errors,
    );
}

/**
 * Throws an `E-ARGS` error for a call the write path refuses before writing. A `TimelineText` is
 * the message the user sees. A plain string is for developers: a call the app never makes (a
 * missing row, beats that aren't whole), so the user sees the generic message and the log has
 * the string.
 */
export function refuse(message: string | TimelineText): never {
    throw new TimelineWriteError("E-ARGS", message);
}

/**
 * Refuses (`E-ARGS`) a batch that names the same row twice. Update functions plan every change
 * from rows read before the first write, so a second entry for one id would be planned against
 * stale data.
 */
export function refuseDuplicateIds(
    items: readonly { id: number }[],
    what: string,
): void {
    const seen = new Set<number>();
    for (const { id } of items) {
        if (seen.has(id)) refuse(`${what} ${id} appears more than once`);
        seen.add(id);
    }
}

/**
 * A spec error code at the start of a trigger's message, e.g. "E-A1: ..." or the combined
 * "E-T3/E-T4: ...". Anchored, so text inside a failed query's parameters (a name such as "E-T1")
 * can't be mistaken for a code.
 */
const DB_CODE = /^(E-[A-Z]\d(?:\/E-[A-Z]\d)?):/;

/**
 * Runs a database write, and turns the invariant triggers' rejections (whose messages start with
 * the spec's error code) into `TimelineWriteError`s. Any other database error becomes `E-DB` with
 * the SQLite message; a `TimelineWriteError` passes through unchanged.
 */
export async function mapDbErrors<T>(write: () => Promise<T>): Promise<T> {
    try {
        return await write();
    } catch (error) {
        if (error instanceof TimelineWriteError) throw error;
        const messages: string[] = [];
        for (let e: unknown = error; e instanceof Error; e = e.cause)
            messages.push(e.message);
        // The innermost cause is SQLite's own message; check it first.
        const detail =
            [...messages].reverse().find((m) => DB_CODE.test(m.trim())) ??
            messages[messages.length - 1] ??
            "database error";
        const code = DB_CODE.exec(detail.trim())?.[1];
        throw new TimelineWriteError(code ?? "E-DB", detail, [], {
            cause: error,
        });
    }
}

/**
 * Thrown inside an edit that turned out to write nothing, so it rolls back with no undo step; the
 * caller catches it and returns `result` (what the command would report).
 */
export class NothingToDo<R> extends Error {
    constructor(readonly result: R) {
        super("nothing to do");
    }
}
