import { expect } from "vitest";
import * as fc from "fast-check";
import { describeDbTests } from "@/test/base";
import { performRedo, performUndo } from "@/db-functions/history";
import { buildRichShow, dumpAll, expectNoProblems } from "./countEditShow";
import {
    applyAndCheck,
    describeEdit,
    durations,
    measureSpan,
    respacedFor,
    holdsOf,
    type CountEdit,
} from "./countEditCheck";
import { newCountLength } from "../tempoMath";

/**
 * Random sequences of count edits on the rich show (`countEditShow.ts`), each checked by
 * `applyAndCheck` (nothing lost, nothing moved; a refused edit writes nothing; a prop put down
 * mid-move may move with its holder, as the matrix documents), then the whole
 * sequence undone back to the show it started from and redone back to where it ended, comparing
 * full dumps.
 *
 * Runs `COUNT_EDIT_FUZZ_RUNS` sequences (default 6, a few seconds) from the seed
 * `COUNT_EDIT_FUZZ_SEED` (default a fixed one, so the normal suite is repeatable; set it to
 * `random` for a new one each run). A failure prints the seed and the sequence.
 *
 * Known and left to the owner (counted, not failed): a removed count that makes a keyframe end
 * where the move under it now ends hides that move's set (`layerTies`, see the matrix test).
 */

const RUNS = Number(process.env.COUNT_EDIT_FUZZ_RUNS ?? 6);
const SEED =
    process.env.COUNT_EDIT_FUZZ_SEED === "random"
        ? undefined
        : Number(process.env.COUNT_EDIT_FUZZ_SEED ?? 20261103);

/** One edit as drawn; the counts it names are worked out against the show when it runs */
interface Draw {
    kind: "add" | "remove";
    at: number;
    count: number;
    choice: "shift" | "keepInPlace" | "keepOnly";
}

const draw: fc.Arbitrary<Draw> = fc.record({
    kind: fc.constantFrom("add" as const, "remove" as const),
    // mostly inside the pages (1–48), sometimes past them and past the stored counts
    at: fc.oneof(
        { weight: 8, arbitrary: fc.integer({ min: 1, max: 50 }) },
        { weight: 1, arbitrary: fc.integer({ min: 51, max: 110 }) },
    ),
    count: fc.oneof(
        { weight: 3, arbitrary: fc.constant(1) },
        { weight: 1, arbitrary: fc.integer({ min: 2, max: 6 }) },
    ),
    choice: fc.constantFrom(
        "shift" as const,
        "keepInPlace" as const,
        "keepOnly" as const,
    ),
});

/** The edit a draw makes on the show as it is now, as the tempo band would make it */
async function editOf(
    db: Parameters<typeof durations>[0],
    d: Draw,
): Promise<CountEdit> {
    const lengths = await durations(db);
    const holds = await holdsOf(db);
    // keep everything else in place is offered for one count only
    const choice =
        d.count > 1 && d.choice === "keepInPlace" ? "keepOnly" : d.choice;
    const drill = choice === "shift" ? "adjust" : "keep";
    if (d.kind === "add") {
        const len = newCountLength(lengths, holds, d.at);
        const edit: CountEdit = {
            kind: "insert",
            at: d.at,
            count: d.count,
            duration: len,
            drill,
        };
        if (choice === "keepInPlace" && d.at < lengths.length)
            edit.respaced = respacedFor(
                lengths,
                await measureSpan(db, d.at === 1 ? 1 : d.at - 1),
                { kind: "insert", at: d.at, count: 1, len },
                holds,
            );
        return edit;
    }
    const edit: CountEdit = {
        kind: "delete",
        from: d.at,
        to: d.at + d.count,
        drill,
    };
    if (choice === "keepInPlace" && d.at + 1 < lengths.length) {
        const span = await measureSpan(db, d.at);
        if (span.e - span.a > 1)
            edit.respaced = respacedFor(
                lengths,
                span,
                {
                    kind: "delete",
                    from: d.at,
                    to: d.at + 1,
                },
                holds,
            );
    }
    return edit;
}

describeDbTests("count edits, random sequences (property)", (it) => {
    it(
        "never lose or move data, refuse without writing, and undo and redo exactly",
        { timeout: Math.max(60_000, RUNS * 20_000) },
        async ({ db, marchersAndPages: _ }) => {
            await buildRichShow(db);
            const start = await dumpAll(db);
            await fc.assert(
                fc.asyncProperty(
                    fc.array(draw, { minLength: 1, maxLength: 5 }),
                    async (draws) => {
                        const done: string[] = [];
                        let applied = 0;
                        // edits of this run on the undo stack right now
                        let depth = 0;
                        try {
                            for (const d of draws) {
                                const edit = await editOf(db, d);
                                const outcome = await applyAndCheck(db, edit, {
                                    undo: false,
                                });
                                done.push(
                                    `${describeEdit(edit)}${outcome.error ? " (refused)" : ""}`,
                                );
                                if (outcome.problems.length)
                                    expectNoProblems([
                                        `after ${done.join(", ")}:`,
                                        ...outcome.problems,
                                    ]);
                                if (!outcome.error) {
                                    applied++;
                                    depth++;
                                }
                            }
                            const end = await dumpAll(db);
                            for (; depth > 0; depth--) await performUndo(db);
                            expect(
                                await dumpAll(db),
                                `undo all of ${done.join(", ")}`,
                            ).toEqual(start);
                            for (; depth < applied; depth++)
                                await performRedo(db);
                            expect(
                                await dumpAll(db),
                                `redo all of ${done.join(", ")}`,
                            ).toEqual(end);
                        } finally {
                            // back to the show this run started from, for the next run
                            for (; depth > 0; depth--)
                                await performUndo(db).catch(() => undefined);
                        }
                    },
                ),
                { numRuns: RUNS, seed: SEED, endOnFailure: true },
            );
        },
    );
});
