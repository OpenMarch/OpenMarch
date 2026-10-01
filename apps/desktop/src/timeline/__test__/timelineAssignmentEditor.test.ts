import { describe, expect, it } from "vitest";
import { createResolver, type TimelineSnapshot } from "@openmarch/core";
import { GOLDEN_FIXTURES } from "../fixtures/goldenFixtures";
import {
    buildAssignmentEditTarget,
    castBlocker,
    castCandidates,
    castMode,
    planAssignmentEdit,
    recastBlocker,
    stolenRanges,
    summarizeSlots,
    type AssignmentEditTarget,
} from "../timelineAssignmentEditor";
import { MAX_CAST_SLOTS } from "../timelineCasting";

/**
 * P8.4: the assignments editor's pure parts on the golden vectors (spec §12.4): slots and
 * vacancies, where a higher layer steals an assignment (R-2, ui.md UI-1), and which changes write
 * something.
 */

const golden = (name: string): TimelineSnapshot => {
    const fixture = GOLDEN_FIXTURES.find((f) => f.name === name);
    if (!fixture) throw new Error(`no golden fixture ${name}`);
    return fixture.build().show;
};

const targetOf = (show: TimelineSnapshot, transitionId: number) => {
    const resolver = createResolver(show);
    return buildAssignmentEditTarget(show.transitions[transitionId]!, 1, {
        assignments: show.assignments,
        labels: new Map(show.marchers.map((m) => [m.id, `M${m.id}`])),
        spansOf: (id) => resolver.spanInfos(id),
    });
};

describe("stolen ranges", () => {
    it("G2: the layer-1 row steals [8, 16) of the layer-0 row, and is never stolen itself", () => {
        const show = golden("G2");
        const base = targetOf(show, 1).members[0]!;
        expect(base.stolen).toEqual([{ start: 8, end: 16, byTransitionId: 2 }]);
        expect(targetOf(show, 2).members[0]!.stolen).toEqual([]);
    });

    it("G3: stacked steals; the base row is stolen once by B and once more by B after C", () => {
        const show = golden("G3");
        // A [0,16) L0 loses [4,6) to B, [6,10) to C, [10,12) to B
        expect(targetOf(show, 1).members[0]!.stolen).toEqual([
            { start: 4, end: 6, byTransitionId: 2 },
            { start: 6, end: 10, byTransitionId: 3 },
            { start: 10, end: 12, byTransitionId: 2 },
        ]);
        // B [4,12) L1 loses [6,10) to C; C wins all of its beats
        expect(targetOf(show, 2).members[0]!.stolen).toEqual([
            { start: 6, end: 10, byTransitionId: 3 },
        ]);
        expect(targetOf(show, 3).members[0]!.stolen).toEqual([]);
    });

    it("merges back-to-back pieces won by the same transition", () => {
        const row = {
            id: 1,
            marcher: 1,
            transition: 1,
            slot: 0,
            start: 0,
            end: 10,
            layer: 0,
        };
        const span = (start: number, end: number, assignmentId: number) => ({
            marcherId: 1,
            start,
            end,
            kind: "founding" as const,
            assignmentId,
            transitionId: assignmentId,
            slot: 0,
        });
        expect(
            stolenRanges(row, [
                span(0, 2, 1),
                span(2, 4, 5),
                span(4, 6, 5),
                span(6, 10, 1),
            ]),
        ).toEqual([{ start: 2, end: 6, byTransitionId: 5 }]);
    });
});

describe("the target", () => {
    it("lists members in slot order with labels, and the vacant slots (D-13)", () => {
        // G9: T2 has 4 slots and three members, so one is vacant
        const show = golden("G9");
        const id = Number(
            Object.values(show.transitions).find((t) => t.slots === 4)!.id,
        );
        const target = targetOf(show, id);
        expect(target.slotCount).toBe(4);
        expect(target.members.map((m) => m.slot)).toEqual(
            [...target.members.map((m) => m.slot)].sort((a, b) => a - b),
        );
        expect(target.members.every((m) => m.label.startsWith("M"))).toBe(true);
        expect(target.vacantSlots).toHaveLength(4 - target.members.length);
        expect(target.vacantSlots.length).toBeGreaterThan(0);
    });
});

const target = (
    over: Partial<AssignmentEditTarget> = {},
): AssignmentEditTarget => ({
    version: 1,
    transitionId: 7,
    style: "direct",
    start: 0,
    end: 8,
    slotCount: 3,
    members: [
        {
            assignmentId: 11,
            marcherId: 1,
            label: "A1",
            slot: 0,
            start: 0,
            end: 8,
            layer: 0,
            stolen: [],
        },
    ],
    vacantSlots: [1, 2],
    ...over,
});

describe("blockers", () => {
    it("casting needs a selection, someone not cast yet, and enough vacancies", () => {
        const t = target();
        expect(castCandidates(t, [1, 2, 3])).toEqual([2, 3]);
        expect(castBlocker(t, [], 0)).toBe("noneSelected");
        expect(castBlocker(t, castCandidates(t, [1]), 1)).toBe("allCast");
        expect(castBlocker(t, [2, 3], 3)).toBeNull();
        expect(castBlocker(t, [2, 3, 4], 4)).toBe("noVacancy");
        expect(
            castBlocker(target({ slotCount: MAX_CAST_SLOTS + 1 }), [2], 1),
        ).toBe("tooManySlots");
    });

    it("follow the leader casts into the lowest vacant slots, at any size, and is never recast (R-9, R-12)", () => {
        const ftl = target({
            style: "follow_the_leader",
            slotCount: MAX_CAST_SLOTS + 1,
        });
        expect(castMode(ftl)).toBe("lowest");
        expect(castBlocker(ftl, [2], 1)).toBeNull();
        expect(recastBlocker(ftl)).toBe("followTheLeader");
        expect(castMode(target({ style: "arc" }))).toBe("nearest");
    });

    it("recasting needs a member and a solvable slot count", () => {
        expect(recastBlocker(target())).toBeNull();
        expect(recastBlocker(target({ members: [] }))).toBe("noMembers");
        expect(recastBlocker(target({ slotCount: MAX_CAST_SLOTS + 1 }))).toBe(
            "tooManySlots",
        );
    });
});

describe("planAssignmentEdit", () => {
    it("skips changes that write nothing", () => {
        const t = target();
        expect(
            planAssignmentEdit(t, { kind: "slot", assignmentId: 11, slot: 0 }),
        ).toBeNull();
        expect(
            planAssignmentEdit(t, {
                kind: "layer",
                assignmentId: 11,
                layer: 0,
            }),
        ).toBeNull();
        expect(
            planAssignmentEdit(t, {
                kind: "beats",
                assignmentId: 11,
                start: 0,
                end: 8,
            }),
        ).toBeNull();
        expect(
            planAssignmentEdit(t, { kind: "cast", marcherIds: [] }),
        ).toBeNull();
    });

    it("plans real changes as given", () => {
        const t = target();
        for (const edit of [
            { kind: "slot", assignmentId: 11, slot: 2 },
            { kind: "layer", assignmentId: 11, layer: 3 },
            { kind: "beats", assignmentId: 11, start: 2, end: 8 },
            { kind: "remove", assignmentId: 11 },
            { kind: "cast", marcherIds: [4] },
            { kind: "recast" },
        ] as const)
            expect(planAssignmentEdit(t, edit)).toEqual(edit);
    });
});

describe("summarizeSlots", () => {
    it("writes runs as ranges", () => {
        expect(summarizeSlots([0, 1, 2, 3, 5, 7, 8])).toBe("0–3, 5, 7–8");
        expect(summarizeSlots([4])).toBe("4");
        expect(summarizeSlots([])).toBe("");
    });

    it("stops after a few parts and counts the slots left", () => {
        const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 20, 22, 23, 30];
        expect(summarizeSlots(slots, 2)).toBe("0–9, 12, … (+4)");
    });
});
