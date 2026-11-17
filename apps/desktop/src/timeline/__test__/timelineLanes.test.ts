// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hiddenLaneCount, laneStates, lanesMenuModel } from "../timelineLanes";

const NAMES: Record<string, string> = {
    "timeline.lanes.moves": "Moves",
    "cues.lane.equipment": "Equipment",
    "cues.laneFamily.equipment": "Equipment",
};
const nameOf = (key: string) => NAMES[key] ?? key;
const counts = (entries: [string, number][] = []) => new Map(entries);
const byId = (states: ReturnType<typeof laneStates>) =>
    Object.fromEntries(
        states.map((s) => [s.lane.id, { inShow: s.inShow, shown: s.shown }]),
    );

describe("timeline lanes in use (#992)", () => {
    it("lists Moves in Expert and only the cue lanes the show uses", () => {
        expect(
            byId(laneStates({ saved: {}, cueCounts: counts(), expert: true })),
        ).toEqual({
            moves: { inShow: true, shown: true },
            equipment: { inShow: false, shown: false },
        });
        expect(
            byId(
                laneStates({
                    saved: {},
                    cueCounts: counts([["equipment", 3]]),
                    expert: false,
                }),
            ),
        ).toEqual({
            moves: { inShow: false, shown: false },
            equipment: { inShow: true, shown: true },
        });
    });

    it("keeps a lane the user added, empty, and a hidden lane with cues in the list", () => {
        const added = laneStates({
            saved: { equipment: true },
            cueCounts: counts(),
            expert: true,
        });
        expect(byId(added).equipment).toEqual({ inShow: true, shown: true });
        const hidden = laneStates({
            saved: { equipment: false, moves: false },
            cueCounts: counts([["equipment", 2]]),
            expert: true,
        });
        expect(byId(hidden)).toEqual({
            moves: { inShow: true, shown: false },
            equipment: { inShow: true, shown: false },
        });
        expect(hiddenLaneCount(hidden)).toBe(2);
    });

    it("sends a hidden lane with no cues back to Add a lane, uncounted", () => {
        const states = laneStates({
            saved: { equipment: false },
            cueCounts: counts(),
            expert: true,
        });
        expect(byId(states).equipment).toEqual({ inShow: false, shown: false });
        expect(hiddenLaneCount(states)).toBe(0);
    });
});

describe("the Lanes menu (#992)", () => {
    it("puts the lanes in use first, and the rest under Add a lane by family", () => {
        const model = lanesMenuModel(
            laneStates({ saved: {}, cueCounts: counts(), expert: true }),
            "",
            nameOf,
        );
        expect(model.inShow.map((s) => s.lane.id)).toEqual(["moves"]);
        expect(
            model.add.map((f) => [f.familyKey, f.lanes.map((s) => s.lane.id)]),
        ).toEqual([["cues.laneFamily.equipment", ["equipment"]]]);
    });

    it("has nothing to add once every built lane is in the show", () => {
        const model = lanesMenuModel(
            laneStates({
                saved: {},
                cueCounts: counts([["equipment", 1]]),
                expert: true,
            }),
            "",
            nameOf,
        );
        expect(model.inShow.map((s) => s.lane.id)).toEqual([
            "moves",
            "equipment",
        ]);
        expect(model.inShow[1].cueCount).toBe(1);
        expect(model.add).toEqual([]);
    });

    it("filters both sections by the search, ignoring case", () => {
        const states = laneStates({
            saved: {},
            cueCounts: counts(),
            expert: true,
        });
        const equip = lanesMenuModel(states, "EQUIP", nameOf);
        expect(equip.inShow).toEqual([]);
        expect(equip.add.flatMap((f) => f.lanes.map((s) => s.lane.id))).toEqual(
            ["equipment"],
        );
        const moves = lanesMenuModel(states, "mov", nameOf);
        expect(moves.inShow.map((s) => s.lane.id)).toEqual(["moves"]);
        expect(moves.add).toEqual([]);
        const none = lanesMenuModel(states, "zzz", nameOf);
        expect(none.inShow).toEqual([]);
        expect(none.add).toEqual([]);
    });
});
