// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { PlacementChange, PutDownAnchor, XY } from "@openmarch/core";
import {
    cueNotes,
    itemNotes,
    notesAt,
    notesForItem,
    sortShowNotes,
    type ItemNotesInput,
    type NoteItem,
} from "../showNotes";

// Performers
const ALICE = 1;
const BOB = 2;
const CREW = 3;

// Items and their marchers rows
const FLAG: NoteItem = { id: 10, marcherId: 110, kind: "equipment" };
const RIFLE: NoteItem = { id: 11, marcherId: 111, kind: "equipment" };
const RISER: NoteItem = { id: 20, marcherId: 120, kind: "prop" };
const CART: NoteItem = { id: 21, marcherId: 121, kind: "prop" };

let nextId = 1;
const change = (
    beat: number,
    patch: Partial<PlacementChange>,
): PlacementChange => ({
    id: nextId++,
    beat,
    state: "placed",
    holders: [],
    crew: [],
    groupId: null,
    ...patch,
});

/**
 * Alice holds the flag in both hands from 2 and takes the rifle in her right hand on 4 without
 * putting the flag down until 8, where its own move puts it away from her. The riser has a crew
 * that walks off from 14. The cart moves on 18 with no crew.
 */
const flagPutDown = change(8, {});
const changesByItem = new Map<number, PlacementChange[]>([
    [
        FLAG.id,
        [
            change(2, {
                state: "held",
                holders: [{ marcherId: ALICE, hand: "both" }],
            }),
            flagPutDown,
        ],
    ],
    [
        RIFLE.id,
        [
            change(4, {
                state: "held",
                holders: [{ marcherId: ALICE, hand: "right" }],
            }),
        ],
    ],
    [RISER.id, [change(10, { crew: [CREW] })]],
    [CART.id, [change(0, {})]],
]);

const positionAt = (marcherId: number, beat: number): XY | null => {
    switch (marcherId) {
        case ALICE:
            return [50, 0];
        case BOB:
            return [0, 0];
        case CREW:
            // walks off over [12, 16]
            return beat <= 12
                ? [100, 0]
                : beat >= 16
                  ? [200, 0]
                  : [100 + 25 * (beat - 12), 0];
        case FLAG.marcherId:
            return [0, 0];
        case RISER.marcherId:
            return [100, 0];
        case CART.marcherId:
            return beat <= 17 ? [0, 50] : beat >= 20 ? [30, 50] : [10, 50];
        default:
            return null;
    }
};

const BREAKS: Record<number, number[]> = {
    [CREW]: [12, 16],
    [CART.marcherId]: [17, 20],
    [FLAG.marcherId]: [4, 8],
};

const FLAG_ANCHORS: PutDownAnchor[] = [
    {
        kind: "own_move",
        changeId: flagPutDown.id,
        beat: 8,
        holders: [{ marcherId: ALICE, hand: "both" }],
        spot: [50, 0],
        move: { start: 4, end: 8 },
    },
];

const input = (patch: Partial<ItemNotesInput> = {}): ItemNotesInput => ({
    items: [FLAG, RIFLE, RISER, CART],
    changesByItem,
    beatCount: 32,
    positionAt,
    basePositionAt: positionAt,
    breaksOf: (id) => BREAKS[id] ?? [],
    putDownsOf: (id) => (id === FLAG.marcherId ? FLAG_ANCHORS : []),
    crewReach: 16,
    warnPropMovesWithoutCrew: false,
    ...patch,
});

describe("itemNotes", () => {
    it("names each producer at its count, in count order", () => {
        expect(sortShowNotes(itemNotes(input()))).toEqual([
            {
                id: `hand_conflict:${FLAG.id}:${ALICE}:4`,
                kind: "hand_conflict",
                source: "items",
                beat: 4,
                until: 8,
                what: {
                    itemIds: [FLAG.id, RIFLE.id],
                    marcherIds: [ALICE],
                    cueIds: [],
                },
                detail: { hand: "right" },
            },
            {
                // The rifle takes both hands (no model grips say otherwise)
                id: `short_handed_hold:${RIFLE.id}:${changesByItem.get(RIFLE.id)![0]!.id}`,
                kind: "short_handed_hold",
                source: "items",
                beat: 4,
                until: null,
                what: {
                    itemIds: [RIFLE.id],
                    marcherIds: [ALICE],
                    cueIds: [],
                },
                detail: { needed: 2, held: 1 },
            },
            {
                id: `put_down_drift:${FLAG.id}:${flagPutDown.id}`,
                kind: "put_down_drift",
                source: "items",
                beat: 8,
                until: 9,
                what: {
                    itemIds: [FLAG.id],
                    marcherIds: [ALICE],
                    cueIds: [],
                },
                action: { kind: "snap_to_holder", placementId: flagPutDown.id },
            },
            {
                // The crew leaves reach on 13, between the breaks at 12 and 16
                id: `crew_distance:${RISER.id}:10`,
                kind: "crew_distance",
                source: "items",
                beat: 13,
                until: 32,
                what: {
                    itemIds: [RISER.id],
                    marcherIds: [CREW],
                    cueIds: [],
                },
            },
        ]);
    });

    it("warns of a prop moving without a crew only when the show setting is on", () => {
        const notes = itemNotes(input({ warnPropMovesWithoutCrew: true }));
        expect(notes.filter((n) => n.kind === "crewless_move")).toMatchObject([
            { id: `crewless_move:${CART.id}:0`, beat: 18 },
        ]);
    });

    it("never warns of equipment moving without a crew", () => {
        expect(
            itemNotes(
                input({
                    items: [{ ...CART, kind: "equipment" }],
                    warnPropMovesWithoutCrew: true,
                }),
            ),
        ).toEqual([]);
    });

    it("is quiet for a crew in reach and a put-down the item's own move puts at its holder", () => {
        const notes = itemNotes(
            input({
                items: [FLAG, RISER],
                crewReach: 1000,
                basePositionAt: (id, beat) =>
                    id === FLAG.marcherId ? [50, 0] : positionAt(id, beat),
            }),
        );
        expect(notes).toEqual([]);
    });
});

describe("hand conflicts", () => {
    const items = [0, 1, 2, 3].map(
        (i): NoteItem => ({
            id: 30 + i,
            marcherId: 130 + i,
            kind: "equipment",
        }),
    );
    it("is one note per item not drawn, sides merged, however many items take the hand after it", () => {
        // A 4-item ripple into Alice's two hands, a count apart
        const changes = new Map(
            items.map((item, i) => [
                item.id,
                [
                    change(9 + i, {
                        state: "held",
                        holders: [{ marcherId: ALICE, hand: "both" }],
                    }),
                ],
            ]),
        );
        const notes = itemNotes(
            input({ items, changesByItem: changes, putDownsOf: () => [] }),
        );
        expect(
            notes.map((n) => [n.what.itemIds[0], n.beat, n.detail?.hand]),
        ).toEqual([
            [30, 10, "both"],
            [31, 11, "both"],
            [32, 12, "both"],
        ]);
        expect(notes[0]!.what.itemIds).toEqual([30, 31, 32, 33]);
    });

    it("names a Carry cue that has the hand", () => {
        const notes = itemNotes(
            input({
                items: [FLAG],
                carries: [{ marcherId: ALICE, beat: 5, hands: "both" }],
                putDownsOf: () => [],
            }),
        );
        expect(notes).toMatchObject([
            {
                kind: "hand_conflict",
                beat: 5,
                until: 8,
                detail: { hand: "both", byCarry: true },
            },
        ]);
    });

    it("notes a two-hand item left with one holder's hand", () => {
        const notes = itemNotes(
            input({
                items: [RIFLE],
                putDownsOf: () => [],
            }),
        );
        expect(notes).toMatchObject([
            {
                kind: "short_handed_hold",
                beat: 4,
                what: { itemIds: [RIFLE.id], marcherIds: [ALICE] },
                detail: { needed: 2, held: 1 },
            },
        ]);
    });
});

describe("cue notes", () => {
    it("places the cue compiler's notes on their cue's count", () => {
        expect(
            cueNotes(
                [
                    { kind: "silk_aspect", cueIds: [7], marcherIds: [ALICE] },
                    { kind: "carry_mismatch", cueIds: [9], marcherIds: [BOB] },
                ],
                (id) => (id === 7 ? 12 : null),
            ),
        ).toMatchObject([
            {
                kind: "silk_aspect",
                source: "cues",
                beat: 12,
                what: { cueIds: [7], marcherIds: [ALICE] },
            },
            { kind: "carry_mismatch", beat: null },
        ]);
    });
});

describe("note lookups", () => {
    const notes = sortShowNotes(itemNotes(input()));

    it("shows each note on its item", () => {
        expect(notesForItem(notes, FLAG.id).map((n) => n.kind)).toEqual([
            "hand_conflict",
            "put_down_drift",
        ]);
        expect(notesForItem(notes, RIFLE.id).map((n) => n.kind)).toEqual([
            "short_handed_hold",
        ]);
    });

    it("counts the notes that apply at a moment", () => {
        const flagNotes = notesForItem(notes, FLAG.id);
        expect(notesAt(flagNotes, 3)).toBe(0);
        expect(notesAt(flagNotes, 5)).toBe(1);
        expect(notesAt(flagNotes, 8)).toBe(1);
        expect(notesAt(flagNotes, 20)).toBe(0);
    });
});

describe("cost", () => {
    it("checks 100 props over 6000 beats well under 50 ms", () => {
        const BEATS = 6000;
        const props: NoteItem[] = [];
        const changes = new Map<number, PlacementChange[]>();
        const breaks = new Map<number, number[]>();
        const walk = (id: number, beat: number): XY => {
            // Every marcher walks a 16-count move every 64 counts
            const leg = Math.floor(beat / 64);
            const into = Math.min(16, beat - leg * 64) / 16;
            const x = (leg + into) * 4 + (id % 7);
            return [x, id % 11];
        };
        for (let i = 0; i < 100; i++) {
            const item: NoteItem = {
                id: 1000 + i,
                marcherId: 2000 + i,
                kind: "prop",
            };
            props.push(item);
            const crew = [3000 + 2 * i, 3001 + 2 * i];
            changes.set(item.id, [change(0, { crew })]);
            for (const id of [item.marcherId, ...crew]) {
                const list: number[] = [];
                for (let b = 0; b < BEATS; b += 64) list.push(b, b + 16);
                breaks.set(id, list);
            }
        }
        let calls = 0;
        const bench = input({
            items: props,
            changesByItem: changes,
            beatCount: BEATS,
            positionAt: (id, beat) => {
                calls++;
                return walk(id, beat);
            },
            breaksOf: (id) => breaks.get(id) ?? [],
            putDownsOf: () => [],
            crewReach: 1000,
            warnPropMovesWithoutCrew: true,
        });
        // The first pass warms the JIT; the best of three is the cost a recompute pays, and is
        // robust to a busy CI runner
        expect(itemNotes(bench)).toEqual([]);
        calls = 0;
        let ms = Infinity;
        for (let i = 0; i < 3; i++) {
            const start = performance.now();
            itemNotes(bench);
            ms = Math.min(ms, performance.now() - start);
        }
        expect(ms).toBeLessThan(50);
        // Breaks, not beats: about 190 checks per prop instead of 6000
        expect(calls / 3).toBeLessThan(100 * 3 * 200);
    });
});
