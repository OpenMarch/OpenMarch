// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SpanInfo } from "@openmarch/core";
import {
    followingPages,
    marcherNamesText,
    pageKeepStates,
    pagesText,
    type KeepPage,
} from "../timelineKeepLater";

/**
 * UI-18 keep later pages: the selection's keep state on each page box (follows after an earlier
 * move or from the start), the pages that follow the current one, and the marchers' names in the
 * keep words (up to three).
 *
 * Pages: home (1), page 2 [1, 9), page 3 [9, 17), page 4 [17, 25), page 5 [25, 33).
 */

const PAGES: KeepPage[] = [
    { id: 1, name: "1", flag: 0, range: null },
    { id: 2, name: "2", flag: 9, range: { start: 1, end: 9 } },
    { id: 3, name: "3", flag: 17, range: { start: 9, end: 17 } },
    { id: 4, name: "4", flag: 25, range: { start: 17, end: 25 } },
    { id: 5, name: "5", flag: 33, range: { start: 25, end: 33 } },
];

let nextId = 1;
const move = (marcherId: number, start: number, end: number, id?: number) =>
    ({
        marcherId,
        start,
        end,
        kind: "founding",
        assignmentId: id ?? nextId++,
        transitionId: null,
        slot: null,
    }) as SpanInfo;
const hold = (marcherId: number, start: number, end: number) =>
    ({
        marcherId,
        start,
        end,
        kind: "hold",
        assignmentId: null,
        transitionId: null,
        slot: null,
    }) as SpanInfo;

/**
 * 1 and 2 move on page 2 and hold after; 2 has its own move that goes nowhere on page 3 (Set as
 * shown); 3 moves on page 2 and on page 4; 4 never moves.
 */
const SPANS: Record<number, SpanInfo[]> = {
    1: [hold(1, -Infinity, 1), move(1, 1, 9), hold(1, 9, Infinity)],
    2: [
        hold(2, -Infinity, 1),
        move(2, 1, 9),
        move(2, 9, 17, 100),
        hold(2, 17, Infinity),
    ],
    3: [
        hold(3, -Infinity, 1),
        move(3, 1, 9),
        hold(3, 9, 17),
        move(3, 17, 25),
        hold(3, 25, Infinity),
    ],
    4: [hold(4, -Infinity, Infinity)],
};

const states = (marcherIds: number[]) =>
    pageKeepStates({
        pages: PAGES,
        marcherIds,
        spansOf: (id) => SPANS[id] ?? [],
    });

describe("pageKeepStates", () => {
    it("says who follows on each box, and the page they follow", () => {
        const [p2, p3, p4, p5] = states([1, 2, 3, 4]);
        // 1–3 move on page 2; 4 never moved, so it follows the start
        expect(p2).toMatchObject({
            pageId: 2,
            follows: [4],
            fromStart: [4],
            from: [],
        });
        // 2 is Set on page 3 by its own move there
        expect(p3).toMatchObject({
            pageId: 3,
            pageName: "3",
            box: { start: 9, end: 17 },
            follows: [1, 3, 4],
            fromStart: [4],
            from: ["2"],
            selected: 4,
        });
        // 3 moves on page 4; 1 and 2 follow page 2 and 2's move on page 3
        expect(p4).toMatchObject({
            follows: [1, 2, 4],
            from: ["2", "3"],
        });
        expect(p5).toMatchObject({
            follows: [1, 2, 3, 4],
            from: ["2", "3", "4"],
        });
    });

    it("marchers that never moved follow the start on every box, so they can be set ahead of a move", () => {
        for (const s of states([4])) {
            expect(s.follows).toEqual([4]);
            expect(s.fromStart).toEqual([4]);
            expect(s.from).toEqual([]);
        }
        // Set there before any move: its own move, not following
        const spans: SpanInfo[] = [
            hold(5, -Infinity, 9),
            move(5, 9, 17, 500),
            hold(5, 17, Infinity),
        ];
        const [p2, p3] = pageKeepStates({
            pages: PAGES,
            marcherIds: [5],
            spansOf: () => spans,
        });
        expect(p2).toMatchObject({ follows: [5], fromStart: [5] });
        expect(p3).toMatchObject({ follows: [] });
    });
});

describe("followingPages", () => {
    it("names the run of later pages that follow the current one", () => {
        expect(followingPages(states([1]), 2)).toEqual({
            names: ["3", "4", "5"],
            all: true,
        });
        // 3 follows into page 3 only; 1 into all of them
        expect(followingPages(states([1, 3]), 2)).toEqual({
            names: ["3", "4", "5"],
            all: false,
        });
    });

    it("stops a marcher at its own move", () => {
        expect(followingPages(states([2]), 2)).toBeNull();
        expect(followingPages(states([3]), 2)).toEqual({
            names: ["3"],
            all: true,
        });
    });

    it("is null on the last page or with nothing following", () => {
        expect(followingPages(states([1]), 5)).toBeNull();
        expect(followingPages([], 2)).toBeNull();
    });

    it("leaves out marchers that haven't moved yet: every page follows them", () => {
        expect(followingPages(states([4]), 2)).toBeNull();
        expect(followingPages(states([4]), 1, 1)).toBeNull();
        // With one that moved, it says some
        expect(followingPages(states([1, 4]), 2)).toEqual({
            names: ["3", "4", "5"],
            all: false,
        });
    });

    it("from home, starts at the first box", () => {
        // Nobody follows into page 2 (they move there)
        expect(followingPages(states([1]), 1, 1)).toBeNull();
    });
});

describe("marcherNamesText", () => {
    const name = (id: number) => `OT${id}`;
    it("names one, two or three marchers in drill order", () => {
        expect(marcherNamesText([8], name)).toBe("OT8");
        expect(marcherNamesText([8, 1], name)).toBe("OT1 and OT8");
        expect(marcherNamesText([10, 2, 1], name)).toBe("OT1, OT2 and OT10");
    });

    it("past three, names two and counts the others", () => {
        expect(marcherNamesText([1, 2, 3, 4, 5, 6], name)).toBe(
            "OT1, OT2 and 4 others",
        );
    });

    it("is null without names, or with one unknown", () => {
        expect(marcherNamesText([1], undefined)).toBeNull();
        expect(
            marcherNamesText([1, 2], (id) => (id === 1 ? "OT1" : undefined)),
        ).toBeNull();
        expect(marcherNamesText([], name)).toBeNull();
    });
});

describe("pagesText", () => {
    it("names one page or a run", () => {
        expect(pagesText(["3"])).toBe("Page 3");
        expect(pagesText(["3", "4"])).toBe("Pages 3–4");
        expect(pagesText([])).toBe("");
    });
});

describe("pageKeepStates at scale (pre-merge review U4)", () => {
    /** The straightforward version: every move filtered per box, as before indexing */
    const reference = (
        pages: readonly KeepPage[],
        marcherIds: readonly number[],
        spansOf: (id: number) => readonly SpanInfo[],
    ) =>
        pages.flatMap((page) => {
            const box = page.range;
            if (!box) return [];
            const follows: number[] = [];
            const fromStart: number[] = [];
            const from = new Set<number>();
            const midMove: number[] = [];
            for (const id of [...new Set(marcherIds)].sort((a, b) => a - b)) {
                const rows = spansOf(id)
                    .filter((s) => s.kind !== "hold" && s.assignmentId !== null)
                    .map((s) => ({ id: s.assignmentId!, ...s }));
                const over = rows.filter(
                    (r) => r.start < box.end && r.end > box.start,
                );
                if (over.some((r) => r.start < box.start || r.end > box.end))
                    midMove.push(id);
                if (over.length > 0) continue;
                const before = rows
                    .filter((r) => r.end <= box.start)
                    .reduce<
                        (typeof rows)[number] | null
                    >((last, r) => (last && last.end >= r.end ? last : r), null);
                follows.push(id);
                if (!before) fromStart.push(id);
                const source = before
                    ? pages.findIndex(
                          (p) =>
                              p.range &&
                              before.end > p.range.start &&
                              before.end <= p.flag,
                      )
                    : -1;
                if (source >= 0) from.add(source);
            }
            return [
                {
                    pageId: page.id,
                    pageName: page.name,
                    box: { start: box.start, end: box.end },
                    follows,
                    fromStart,
                    from: [...from]
                        .sort((a, b) => a - b)
                        .map((i) => pages[i]!.name),
                    midMove,
                    selected: new Set(marcherIds).size,
                },
            ];
        });

    /** `pageCount` pages of 8 counts after home, and each marcher's moves (some across flags) */
    const bigShow = (
        pageCount: number,
        marchers: number,
        movesEach: number,
    ) => {
        let seed = 7;
        const random = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        const pages: KeepPage[] = [{ id: 0, name: "1", flag: 0, range: null }];
        for (let i = 1; i <= pageCount; i++)
            pages.push({
                id: i,
                name: String(i + 1),
                flag: i * 8,
                range: { start: (i - 1) * 8, end: i * 8 },
            });
        const spans = new Map<number, SpanInfo[]>();
        let id = 1;
        for (let m = 1; m <= marchers; m++) {
            const list: SpanInfo[] = [];
            let at = 0;
            for (let k = 0; k < movesEach && at < pageCount * 8; k++) {
                // Mostly whole pages, some partway or across a flag
                const start = at + Math.floor(random() * 3) * 8;
                const length =
                    random() < 0.8 ? 8 : 1 + Math.floor(random() * 12);
                list.push(move(m, start, start + length, id++));
                at = start + length;
            }
            spans.set(m, list);
        }
        const ids = [...spans.keys()];
        return { pages, ids, spansOf: (m: number) => spans.get(m) ?? [] };
    };

    it("gives the same states as filtering every move per box", () => {
        const { pages, ids, spansOf } = bigShow(30, 40, 20);
        expect(pageKeepStates({ pages, marcherIds: ids, spansOf })).toEqual(
            reference(pages, ids, spansOf),
        );
        // Overlapping moves and equal ends too
        const odd: Record<number, SpanInfo[]> = {
            1: [move(1, 0, 16, 1), move(1, 4, 8, 2), move(1, 2, 8, 3)],
            2: [move(2, 8, 16, 4), move(2, 8, 16, 5)],
        };
        const oddPages = pages.slice(0, 5);
        const spansOdd = (m: number) => odd[m] ?? [];
        expect(
            pageKeepStates({
                pages: oddPages,
                marcherIds: [1, 2],
                spansOf: spansOdd,
            }),
        ).toEqual(reference(oddPages, [1, 2], spansOdd));
    });

    it("150 marchers × 100 pages × 50 moves stays well under a frame budget", () => {
        const { pages, ids, spansOf } = bigShow(100, 150, 50);
        pageKeepStates({ pages, marcherIds: ids, spansOf });
        const t = performance.now();
        pageKeepStates({ pages, marcherIds: ids, spansOf });
        // The reviewer measured ~19 ms before indexing; a generous bound for slow machines
        expect(performance.now() - t).toBeLessThan(100);
    });
});
