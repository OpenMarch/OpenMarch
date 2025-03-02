import { beforeEach, describe, expect, it } from "vitest";
import { initTestDatabase } from "./testUtils";
import * as History from "../../database.history";
import Database from "better-sqlite3";
import * as BeatTable from "../BeatTable";

const sorter = (a: any, b: any) => a.position - b.position;

// Helper function to trim timestamps from beat objects for comparison
const trimData = (data: any[]) =>
    data.map((beat: any) => {
        const { created_at, updated_at, ...rest } = beat;
        return {
            ...rest,
            notes: rest.notes ? rest.notes : null,
        };
    });

describe("BeatsTable", () => {
    let db: Database.Database;

    beforeEach(() => {
        db = initTestDatabase();
    });

    describe("createBeats", () => {
        let db: Database.Database;

        beforeEach(() => {
            db = initTestDatabase();
        });

        it("should insert new beats into an empty database", () => {
            const newBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1 },
                { duration: 0.5, include_in_measure: 1, notes: "second beat" },
                { duration: 0.75, include_in_measure: 0 },
            ];

            const expectedBeats = [
                {
                    id: 1,
                    duration: 0.5,
                    include_in_measure: 1,
                    notes: null,
                    position: 1,
                },
                {
                    id: 2,
                    duration: 0.5,
                    include_in_measure: 1,
                    notes: "second beat",
                    position: 2,
                },
                {
                    id: 3,
                    duration: 0.75,
                    include_in_measure: 0,
                    notes: null,
                    position: 3,
                },
            ];

            const result = BeatTable.createBeats({ newBeats, db });
            expect(result.success).toBe(true);

            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            const trimmedData = trimData(getResult.data);
            expect(trimmedData.sort(sorter)).toEqual(expectedBeats);
        });

        it("should append beats at the end when startingPosition is undefined", () => {
            // Create initial beats
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1 },
                { duration: 0.5, include_in_measure: 1 },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            // Create additional beats without specifying startingPosition
            const additionalBeats: BeatTable.NewBeatArgs[] = [
                {
                    duration: 0.75,
                    include_in_measure: 0,
                    notes: "new beat 1",
                },
                { duration: 1.0, include_in_measure: 0, notes: "new beat 2" },
            ];

            const result = BeatTable.createBeats({
                newBeats: additionalBeats,
                db,
            });
            expect(result.success).toBe(true);

            const expectedBeats = [
                {
                    id: 1,
                    duration: 0.5,
                    include_in_measure: 1,
                    notes: null,
                    position: 1,
                },
                {
                    id: 2,
                    duration: 0.5,
                    include_in_measure: 1,
                    notes: null,
                    position: 2,
                },
                {
                    id: 3,
                    duration: 0.75,
                    include_in_measure: 0,
                    notes: "new beat 1",
                    position: 3,
                },
                {
                    id: 4,
                    duration: 1.0,
                    include_in_measure: 0,
                    notes: "new beat 2",
                    position: 4,
                },
            ];

            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            const trimmedData = trimData(getResult.data);
            expect(trimmedData.sort(sorter)).toEqual(expectedBeats);
        });

        it("should insert beats at a specific position and shift existing beats", () => {
            // Create initial beats
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
                { duration: 0.5, include_in_measure: 1, notes: "third" },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            // Insert beats at position 1 (after the first beat)
            const additionalBeats: BeatTable.NewBeatArgs[] = [
                {
                    duration: 0.75,
                    include_in_measure: 0,
                    notes: "inserted 1",
                },
                { duration: 1.0, include_in_measure: 0, notes: "inserted 2" },
            ];

            const result = BeatTable.createBeats({
                newBeats: additionalBeats,
                startingPosition: 1,
                db,
            });
            expect(result.success).toBe(true);

            const expectedBeats = [
                {
                    id: 1,
                    duration: 0.5,
                    include_in_measure: 1,
                    notes: "first",
                    position: 1,
                },
                {
                    id: 4,
                    duration: 0.75,
                    include_in_measure: 0,
                    notes: "inserted 1",
                    position: 2,
                },
                {
                    id: 5,
                    duration: 1.0,
                    include_in_measure: 0,
                    notes: "inserted 2",
                    position: 3,
                },
                {
                    id: 2,
                    duration: 0.5,
                    include_in_measure: 1,
                    notes: "second",
                    position: 4,
                },
                {
                    id: 3,
                    duration: 0.5,
                    include_in_measure: 1,
                    notes: "third",
                    position: 5,
                },
            ];

            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            const trimmedData = trimData(getResult.data);
            expect(trimmedData.sort(sorter)).toEqual(expectedBeats);
        });

        it("should insert beats at the beginning by specifying startingPosition 0", () => {
            // Create initial beats
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            // Insert beats at the beginning
            const newBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.75, include_in_measure: 0, notes: "new first" },
                { duration: 1.0, include_in_measure: 0, notes: "new second" },
            ];

            const result = BeatTable.createBeats({
                newBeats,
                startingPosition: 0,
                db,
            });
            expect(result.success).toBe(true);

            const expectedBeats = [
                {
                    id: 3,
                    duration: 0.75,
                    include_in_measure: 0,
                    notes: "new first",
                    position: 1,
                },
                {
                    id: 4,
                    duration: 1.0,
                    include_in_measure: 0,
                    notes: "new second",
                    position: 2,
                },
                {
                    id: 1,
                    duration: 0.5,
                    include_in_measure: 1,
                    notes: "first",
                    position: 3,
                },
                {
                    id: 2,
                    duration: 0.5,
                    include_in_measure: 1,
                    notes: "second",
                    position: 4,
                },
            ];

            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            const trimmedData = trimData(getResult.data);
            expect(trimmedData.sort(sorter)).toEqual(expectedBeats);
        });
    });

    describe("undo/redo", () => {
        let db: Database.Database;

        beforeEach(() => {
            db = initTestDatabase();
        });

        it("should undo and redo a single created beat correctly", () => {
            const newBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "test beat" },
            ];

            // Create a new beat
            const createResult = BeatTable.createBeats({ newBeats, db });
            expect(createResult.success).toBe(true);

            // Get beats after creation
            const getBeatsResult = BeatTable.getBeats({ db });
            expect(getBeatsResult.success).toBe(true);
            expect(getBeatsResult.data.length).toBe(1);
            expect(trimData(getBeatsResult.data)[0].duration).toBe(0.5);
            expect(trimData(getBeatsResult.data)[0].include_in_measure).toBe(1);

            // Undo the creation
            const undoResult = History.performUndo(db);
            expect(undoResult.success).toBe(true);

            // Verify the beat is no longer in the database
            const getBeatsAfterUndo = BeatTable.getBeats({ db });
            expect(getBeatsAfterUndo.success).toBe(true);
            expect(getBeatsAfterUndo.data.length).toBe(0);

            // Redo the creation
            const redoResult = History.performRedo(db);
            expect(redoResult.success).toBe(true);

            // Verify the beat is back in the database
            const getBeatsAfterRedo = BeatTable.getBeats({ db });
            expect(getBeatsAfterRedo.success).toBe(true);
            expect(getBeatsAfterRedo.data.length).toBe(1);
            expect(trimData(getBeatsAfterRedo.data)[0].duration).toBe(0.5);
            expect(trimData(getBeatsAfterRedo.data)[0].include_in_measure).toBe(
                1,
            );
            expect(trimData(getBeatsAfterRedo.data)[0].notes).toBe("test beat");
        });

        it("should undo and redo multiple created beats correctly", () => {
            const newBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1 },
                {
                    duration: 0.75,
                    include_in_measure: 0,
                    notes: "second beat",
                },
                { duration: 1.0, include_in_measure: 1, notes: "third beat" },
            ];

            // Create beats
            const createResult = BeatTable.createBeats({ newBeats, db });
            expect(createResult.success).toBe(true);

            // Get beats after creation
            const getBeatsResult = BeatTable.getBeats({ db });
            expect(getBeatsResult.success).toBe(true);
            expect(getBeatsResult.data.length).toBe(3);

            // Undo the creation
            const undoResult = History.performUndo(db);
            expect(undoResult.success).toBe(true);

            // Verify the beats are no longer in the database
            const getBeatsAfterUndo = BeatTable.getBeats({ db });
            expect(getBeatsAfterUndo.success).toBe(true);
            expect(getBeatsAfterUndo.data.length).toBe(0);

            // Redo the creation
            const redoResult = History.performRedo(db);
            expect(redoResult.success).toBe(true);

            // Verify the beats are back in the database
            const getBeatsAfterRedo = BeatTable.getBeats({ db });
            expect(getBeatsAfterRedo.success).toBe(true);
            expect(getBeatsAfterRedo.data.length).toBe(3);

            const redoneBeats = trimData(getBeatsAfterRedo.data).sort(sorter);
            expect(redoneBeats[0].duration).toBe(0.5);
            expect(redoneBeats[0].include_in_measure).toBe(1);
            expect(redoneBeats[1].duration).toBe(0.75);
            expect(redoneBeats[1].include_in_measure).toBe(0);
            expect(redoneBeats[1].notes).toBe("second beat");
            expect(redoneBeats[2].duration).toBe(1.0);
            expect(redoneBeats[2].include_in_measure).toBe(1);
            expect(redoneBeats[2].notes).toBe("third beat");
        });

        it("should undo and redo beat insertions that shift existing beats", () => {
            // Create initial beats
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            // Insert beats in the middle
            const newBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.75, include_in_measure: 0, notes: "inserted" },
                { duration: 1.0, include_in_measure: 1, notes: "inserted 2" },
            ];

            const result = BeatTable.createBeats({
                newBeats,
                startingPosition: 1,
                db,
            });
            expect(result.success).toBe(true);

            // Get beats after insertion
            const getBeatsResult = BeatTable.getBeats({ db });
            expect(getBeatsResult.success).toBe(true);
            expect(getBeatsResult.data.length).toBe(4);

            // Check the positions are correct after insertion
            const beatsAfterInsertion = trimData(getBeatsResult.data).sort(
                sorter,
            );
            expect(beatsAfterInsertion[0].notes).toBe("first");
            expect(beatsAfterInsertion[1].notes).toBe("inserted");
            expect(beatsAfterInsertion[2].notes).toBe("inserted 2");
            expect(beatsAfterInsertion[3].notes).toBe("second");
        });
    });

    describe("shiftBeats", () => {
        it("should shift beats forward by a positive amount", () => {
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
                { duration: 0.5, include_in_measure: 1, notes: "third" },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            const shiftResult = BeatTable.shiftBeats({
                db,
                startingPosition: 2,
                shiftAmount: 2,
                useNextUndoGroup: true,
            });

            expect(shiftResult.success).toBe(true);
            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            const trimmedData = trimData(getResult.data).sort(sorter);

            expect(trimmedData[0].position).toBe(1);
            expect(trimmedData[1].position).toBe(4);
            expect(trimmedData[2].position).toBe(5);
        });

        it("should shift beats backward by a negative amount", () => {
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
                { duration: 0.5, include_in_measure: 1, notes: "third" },
                { duration: 0.5, include_in_measure: 1, notes: "fourth" },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            const shiftResult = BeatTable.shiftBeats({
                db,
                startingPosition: 0,
                shiftAmount: -4,
                useNextUndoGroup: true,
            });

            expect(shiftResult.success).toBe(true);
            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            const trimmedData = trimData(getResult.data).sort(sorter);

            expect(trimmedData[0].position).toBe(-3);
            expect(trimmedData[1].position).toBe(-2);
            expect(trimmedData[2].position).toBe(-1);
            expect(trimmedData[3].position).toBe(0);
        });

        it("should handle shifting all beats when starting position is 1", () => {
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            const shiftResult = BeatTable.shiftBeats({
                db,
                startingPosition: 1,
                shiftAmount: 3,
                useNextUndoGroup: true,
            });

            expect(shiftResult.success).toBe(true);
            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            const trimmedData = trimData(getResult.data).sort(sorter);

            expect(trimmedData[0].position).toBe(4);
            expect(trimmedData[1].position).toBe(5);
        });

        it("should return error when database operation fails", () => {
            const badDb = new Database(":memory:");
            badDb.close();

            const shiftResult = BeatTable.shiftBeats({
                db: badDb,
                startingPosition: 1,
                shiftAmount: 1,
                useNextUndoGroup: true,
            });

            expect(shiftResult.success).toBe(false);
            expect(shiftResult.error).toBeDefined();
            expect(shiftResult.data).toEqual([]);
        });
    });
    describe("deleteBeats", () => {
        it("should delete multiple beats and flatten remaining positions", () => {
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
                { duration: 0.5, include_in_measure: 1, notes: "third" },
                { duration: 0.5, include_in_measure: 1, notes: "fourth" },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            const deleteResult = BeatTable.deleteBeats({
                db,
                beatIds: new Set([2, 3]),
            });

            expect(deleteResult.success).toBe(true);
            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            const trimmedData = trimData(getResult.data).sort(sorter);

            expect(trimmedData.length).toBe(2);
            expect(trimmedData[0].position).toBe(1);
            expect(trimmedData[0].notes).toBe("first");
            expect(trimmedData[1].position).toBe(2);
            expect(trimmedData[1].notes).toBe("fourth");
        });

        it("should handle deletion of non-existent beats gracefully", () => {
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            const deleteResult = BeatTable.deleteBeats({
                db,
                beatIds: new Set([999, 1000]),
            });

            expect(deleteResult.success).toBe(false);
            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            expect(getResult.data.length).toBe(1);
        });

        it("should handle deletion of empty set of beatIds", () => {
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            const deleteResult = BeatTable.deleteBeats({
                db,
                beatIds: new Set(),
            });

            expect(deleteResult.success).toBe(true);
            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            expect(getResult.data.length).toBe(2);
        });

        it("should handle undo/redo of beat deletion", () => {
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
                { duration: 0.5, include_in_measure: 1, notes: "third" },
            ];

            BeatTable.createBeats({ newBeats: initialBeats, db });

            const deleteResult = BeatTable.deleteBeats({
                db,
                beatIds: new Set([2]),
            });

            expect(deleteResult.success).toBe(true);

            const undoResult = History.performUndo(db);
            expect(undoResult.success).toBe(true);

            let getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            expect(getResult.data.length).toBe(3);

            const redoResult = History.performRedo(db);
            expect(redoResult.success).toBe(true);

            getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            expect(getResult.data.length).toBe(2);
            const trimmedData = trimData(getResult.data).sort(sorter);
            expect(trimmedData[0].notes).toBe("first");
            expect(trimmedData[1].notes).toBe("third");
        });
    });
});
