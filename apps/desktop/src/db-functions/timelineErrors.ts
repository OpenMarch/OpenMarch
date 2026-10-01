import type { ValidationError, ValidationResult } from "@openmarch/core";

/**
 * A rejected timeline write (spec section 6). `code` is the spec's error code: `E-S1`, `E-P1`,
 * `E-D2` and `E-N2` come from the core validators and are thrown before the database is touched;
 * `E-A1`, `E-A2`, `E-A3`, `E-T1`, `E-T3`, `E-T4`, `E-T5` and `E-T6` are the invariants the
 * database enforces. Where one trigger checks two invariants and the spec's message names both
 * (`E-A1/E-A2`, `E-T3/E-T4`), `code` is that combined code: the database doesn't say which half
 * failed, so the write path doesn't guess. `E-ARGS` marks a call the write path refuses before writing (a missing row,
 * a slot count that needs destinations, and so on), and `E-DB` any other database rejection.
 */
export class TimelineWriteError extends Error {
    readonly code: string;
    readonly details: ValidationError[];

    constructor(
        code: string,
        message: string,
        details: ValidationError[] = [],
        options?: { cause?: unknown },
    ) {
        super(
            message.startsWith("E-") ? message : `${code}: ${message}`,
            options,
        );
        this.name = "TimelineWriteError";
        this.code = code;
        this.details = details;
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

/** Throws an `E-ARGS` error for a call the write path refuses before writing. */
export function refuse(message: string): never {
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
