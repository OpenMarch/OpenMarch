// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { pickedCueIn, useCueSelectionStore } from "../cueSelectionStore";

const cue = (id: number, createdAt: string) => ({ id, createdAt });

describe("the picked cue (#992)", () => {
    afterEach(() => useCueSelectionStore.getState().pick(null));

    it("is the cue with its id and creation time", () => {
        useCueSelectionStore.getState().pick(cue(3, "2026-11-20 10:00:00"));
        const pick = useCueSelectionStore.getState();
        expect(
            pickedCueIn(
                [cue(2, "2026-11-20 09:00:00"), cue(3, "2026-11-20 10:00:00")],
                pick,
            ),
        ).toEqual(cue(3, "2026-11-20 10:00:00"));
    });

    // Ids are per file: another show's cue 3 isn't the one that was picked
    it("is none in another show whose cue has the same id", () => {
        useCueSelectionStore.getState().pick(cue(3, "2026-11-20 10:00:00"));
        const pick = useCueSelectionStore.getState();
        expect(pickedCueIn([cue(3, "2026-11-22 16:30:00")], pick)).toBeNull();
    });

    it("is none once the cue is gone (deleted or undone)", () => {
        useCueSelectionStore.getState().pick(cue(3, "2026-11-20 10:00:00"));
        expect(
            pickedCueIn([cue(1, "x")], useCueSelectionStore.getState()),
        ).toBeNull();
    });

    it("is none when nothing is picked", () => {
        expect(
            pickedCueIn([cue(1, "x")], useCueSelectionStore.getState()),
        ).toBeNull();
    });
});
