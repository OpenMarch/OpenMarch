// QA-REG-6 (spec 12.6): deep chains must resolve cold, without warming, on a
// deliberately small stack. Ported from docs/timeline/ref/deep.mjs.
//
//   pnpm --dir packages/core run test:deep      (builds dist, then runs this
//                                                 with `node --stack-size=300`)
//   node --stack-size=300 scripts/deep-chains.mjs [N=20000]
//
// The checks use only the public `createResolver`. The recursive oracle is
// deliberately NOT used on these shows: it overflows the stack by design
// (spec 9.3). `--oracle-overflow` runs it once, only to report that.
//
// `runDeepChains(createResolver, N)` is also imported by the Vitest suite
// (`src/timeline/__test__/deepChains.test.ts`) at a smaller N.
import { pathToFileURL } from "node:url";

const dest = (i) => [((i * 37) % 101) - 50, ((i * 53) % 89) - 44];
const close = (a, b) =>
    Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/** A direct chain of `n` half-completed transitions for one marcher. */
export function directChain(n) {
    const db = {
        marchers: [{ id: 1, home: [0, 0] }],
        shapes: {},
        transitions: {},
        assignments: [],
    };
    for (let i = 0; i < n; i++) {
        const [x, y] = dest(i);
        db.shapes[i + 1] = {
            kind: "line",
            geometry: {
                points: [
                    [x, y],
                    [x + 1, y],
                ],
            },
        };
        db.transitions[i + 1] = {
            id: i + 1,
            start: 2 * i,
            end: 2 * i + 2,
            dest: i + 1,
            slots: 1,
            style: "direct",
            order: "inherit",
            params: null,
        };
        db.assignments.push({
            id: i + 1,
            marcher: 1,
            transition: i + 1,
            slot: 0,
            start: 2 * i,
            end: 2 * i + 1,
            layer: 0,
        });
    }
    return db;
}

/** Two marchers through `k` consecutive 2-slot follow-the-leader transitions. */
export function ftlChain(k) {
    const f = {
        marchers: [
            { id: 1, home: [0, 0] },
            { id: 2, home: [1, 0] },
        ],
        shapes: {},
        transitions: {},
        assignments: [],
    };
    for (let i = 1; i <= k; i++) {
        f.shapes[i] = {
            kind: "line",
            geometry: {
                points: [
                    [i % 9, i % 4],
                    [(i % 9) + 1, (i % 4) + 1],
                ],
            },
        };
        f.transitions[i] = {
            id: i,
            start: 2 * (i - 1),
            end: 2 * i,
            dest: i,
            slots: 2,
            style: "follow_the_leader",
            order: "inherit",
            params: { waypoints: [] },
        };
        f.assignments.push(
            {
                id: 2 * i - 1,
                marcher: 1,
                transition: i,
                slot: 0,
                start: 2 * (i - 1),
                end: 2 * i,
                layer: 0,
            },
            {
                id: 2 * i,
                marcher: 2,
                transition: i,
                slot: 1,
                start: 2 * (i - 1),
                end: 2 * i,
                layer: 0,
            },
        );
    }
    return f;
}

/**
 * Runs the three QA-REG-6 shows. Returns `[{ ok, message }]`; never throws for
 * a failed check (a stack overflow is reported as a failure).
 */
export function runDeepChains(createResolver, N = 20000) {
    const results = [];
    const report = (ok, message) => results.push({ ok, message });
    const errText = (e) => (e && e.message ? e.message : String(e));

    // (a) direct chain, each transition half-completed, so the end position
    // depends on every upstream span
    const db = directChain(N);
    const reference = () => {
        let p = [0, 0];
        for (let i = 0; i < N; i++) {
            const [x, y] = db.shapes[i + 1].geometry.points[0];
            p = [p[0] + (x - p[0]) * 0.5, p[1] + (y - p[1]) * 0.5];
        }
        return p;
    };
    const res = createResolver(db);
    let got;
    let err = null;
    try {
        got = res.positionAt(1, 2 * N + 5);
    } catch (e) {
        err = errText(e);
    }
    report(
        !err && close(got, reference()),
        `cold query at the end of ${N} half-completed direct transitions ${err ? "-> " + err : "matches an independent loop"}`,
    );

    // edit the FIRST shape: the whole chain must be dirtied. Log the before-image the app's
    // change-log trigger would (id, kind, geometry), taken before the edit.
    const shapeBefore = { id: 1, ...structuredClone(db.shapes[1]) };
    db.shapes[1].geometry.points = [
        [40, 40],
        [41, 40],
    ];
    err = null;
    try {
        res.notify({
            changes: [
                {
                    table: "shapes",
                    rowId: 1,
                    before: shapeBefore,
                    after: { id: 1, ...db.shapes[1] },
                },
            ],
        });
        got = res.positionAt(1, 2 * N + 5);
    } catch (e) {
        err = errText(e);
    }
    report(
        !err && close(got, reference()),
        `editing the first shape re-resolves the end correctly ${err ? "-> " + err : `(dirty walk visited ${res.counters().dirtyVisits} nodes)`}`,
    );

    // (b) follow-the-leader chain: 2 marchers through N/4 FTL transitions
    const K = Math.floor(N / 4);
    const f = ftlChain(K);
    try {
        const r = createResolver(f);
        const a = r.positionAt(1, 2 * K);
        const b = r.positionAt(2, 2 * K);
        const last = f.shapes[K].geometry.points;
        const ends = [a, b].map((p) => JSON.stringify(p)).sort();
        const want = last.map((p) => JSON.stringify(p)).sort();
        report(
            JSON.stringify(ends) === JSON.stringify(want),
            `cold query at the end of ${K} chained FTL transitions lands on the last shape's two points`,
        );
    } catch (e) {
        report(false, `FTL chain of ${K}: ${errText(e)}`);
    }
    return results;
}

async function main() {
    const args = process.argv.slice(2);
    const n = Number(args.find((a) => /^\d+$/.test(a)) ?? 20000);
    const core = await import("../dist/index.js");
    console.log(`N = ${n}, V8 stack size ~${stackDepth()} frames`);
    const results = runDeepChains(core.createResolver, n);
    for (const { ok, message } of results)
        console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
    const fails = results.filter((r) => !r.ok).length;
    if (args.includes("--oracle-overflow")) {
        try {
            core.createTimelineOracleForTesting(directChain(n)).positionAt(
                1,
                2 * n + 5,
            );
            console.log("INFO  the recursive oracle did not overflow");
        } catch (e) {
            console.log(
                `INFO  the recursive oracle overflows here, as designed (${e instanceof RangeError ? "RangeError" : e})`,
            );
        }
    }
    console.log(fails ? `${fails} failed` : "all deep-chain checks pass");
    if (fails) process.exitCode = 1;
}

/** Rough recursion depth available, to show that the stack really is small. */
function stackDepth() {
    let d = 0;
    const f = () => {
        d++;
        f();
    };
    try {
        f();
    } catch {
        // expected: RangeError
    }
    return d;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
    main();
