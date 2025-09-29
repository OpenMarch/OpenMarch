import { beforeEach, describe, expect, it } from "vitest";
import { initTestDatabase } from "./testUtils";
import * as History from "../../database.history.legacy";
import Database from "better-sqlite3";
import * as BeatTable from "../BeatTable";
import Constants from "../../../../src/global/Constants";
import { FIRST_PAGE_ID } from "@/db-functions";

const sorter = (a: any, b: any) => a.position - b.position;

// Helper function to trim timestamps from beat objects for comparison
const trimData = (data: any[]) =>
    data.map((beat: any) => {
        const {
            created_at: _createdAt,
            updated_at: _updatedAt,
            ...rest
        } = beat;
        return {
            ...rest,
            notes: rest.notes ? rest.notes : null,
        };
    });

const addFirstBeat = (beats: Partial<BeatTable.DatabaseBeat>[]) => {
    const firstBeat = {
        id: 0,
        position: 0,
        duration: 0,
        include_in_measure: 1 as 0 | 1,
        notes: null,
    };
    return [firstBeat, ...beats];
};

describe("BeatsTable", () => {
    let db: Database.Database;

    beforeEach(async () => {
        db = await initTestDatabase();

        // Delete all beats from the database
        db.prepare(
            `DELETE FROM ${Constants.PageTableName} WHERE id > ${FIRST_PAGE_ID}`,
        ).run();
        db.prepare(`DELETE FROM ${Constants.MeasureTableName}`).run();
        db.prepare(
            `DELETE FROM ${Constants.BeatsTableName}  WHERE id > ${FIRST_PAGE_ID}`,
        ).run();
    });

    describe("createBeats", () => {
        it("should insert new beats into an empty database", () => {
            const newBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1 },
                { duration: 0.5, include_in_measure: 1, notes: "second beat" },
                { duration: 0.75, include_in_measure: 0 },
            ];

            const expectedBeats: Partial<BeatTable.DatabaseBeat>[] = [
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
            expect(trimmedData.sort(sorter)).toEqual(
                addFirstBeat(expectedBeats),
            );
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

            const expectedBeats: Partial<BeatTable.DatabaseBeat>[] = [
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
            expect(trimmedData.sort(sorter)).toEqual(
                addFirstBeat(expectedBeats),
            );
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

            const expectedBeats: Partial<BeatTable.DatabaseBeat>[] = [
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
            expect(trimmedData.sort(sorter)).toEqual(
                addFirstBeat(expectedBeats),
            );
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

            const expectedBeats: Partial<BeatTable.DatabaseBeat>[] = [
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
            expect(trimmedData.sort(sorter)).toEqual(
                addFirstBeat(expectedBeats),
            );
        });
    });

    it("should fail to modify the first beat duration", () => {
        const updateFirstBeat = () => {
            db.prepare(
                `UPDATE ${Constants.BeatsTableName} SET duration = 1.0 WHERE id = ?`,
            ).run(BeatTable.FIRST_BEAT_ID);
        };
        expect(updateFirstBeat).toThrow();
    });

    it("should fail to delete the first beat", () => {
        const deleteFirstBeat = () => {
            db.prepare(
                `DELETE FROM ${Constants.BeatsTableName} WHERE id = ?`,
            ).run(BeatTable.FIRST_BEAT_ID);
        };
        expect(deleteFirstBeat).toThrow();
    });

    describe("undo/redo", () => {
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
            expect(getBeatsResult.data.length).toBe(2);
            expect(trimData(getBeatsResult.data)[1].duration).toBe(0.5);
            expect(trimData(getBeatsResult.data)[1].include_in_measure).toBe(1);

            // Undo the creation
            const undoResult = History.performUndo(db);
            expect(undoResult.success).toBe(true);

            // Verify the beat is no longer in the database
            const getBeatsAfterUndo = BeatTable.getBeats({ db });
            expect(getBeatsAfterUndo.success).toBe(true);
            expect(getBeatsAfterUndo.data.length).toBe(1);

            // Redo the creation
            const redoResult = History.performRedo(db);
            expect(redoResult.success).toBe(true);

            // Verify the beat is back in the database
            const getBeatsAfterRedo = BeatTable.getBeats({ db });
            expect(getBeatsAfterRedo.success).toBe(true);
            expect(getBeatsAfterRedo.data.length).toBe(2);
            expect(trimData(getBeatsAfterRedo.data)[1].duration).toBe(0.5);
            expect(trimData(getBeatsAfterRedo.data)[1].include_in_measure).toBe(
                1,
            );
            expect(trimData(getBeatsAfterRedo.data)[1].notes).toBe("test beat");
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
            expect(getBeatsResult.data.length).toBe(4);

            // Undo the creation
            const undoResult = History.performUndo(db);
            expect(undoResult.success).toBe(true);

            // Verify the beats are no longer in the database
            const getBeatsAfterUndo = BeatTable.getBeats({ db });
            expect(getBeatsAfterUndo.success).toBe(true);
            expect(getBeatsAfterUndo.data.length).toBe(1);

            // Redo the creation
            const redoResult = History.performRedo(db);
            expect(redoResult.success).toBe(true);

            // Verify the beats are back in the database
            const getBeatsAfterRedo = BeatTable.getBeats({ db });
            expect(getBeatsAfterRedo.success).toBe(true);
            expect(getBeatsAfterRedo.data.length).toBe(4);

            const redoneBeats = trimData(getBeatsAfterRedo.data).sort(sorter);
            expect(redoneBeats[1].duration).toBe(0.5);
            expect(redoneBeats[1].include_in_measure).toBe(1);
            expect(redoneBeats[2].duration).toBe(0.75);
            expect(redoneBeats[2].include_in_measure).toBe(0);
            expect(redoneBeats[2].notes).toBe("second beat");
            expect(redoneBeats[3].duration).toBe(1.0);
            expect(redoneBeats[3].include_in_measure).toBe(1);
            expect(redoneBeats[3].notes).toBe("third beat");
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
            expect(getBeatsResult.data.length).toBe(5);

            // Check the positions are correct after insertion
            const beatsAfterInsertion = trimData(getBeatsResult.data).sort(
                sorter,
            );
            expect(beatsAfterInsertion[1].notes).toBe("first");
            expect(beatsAfterInsertion[2].notes).toBe("inserted");
            expect(beatsAfterInsertion[3].notes).toBe("inserted 2");
            expect(beatsAfterInsertion[4].notes).toBe("second");
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

            // First beat should not have changed
            expect(trimmedData[0].position).toBe(0);
            expect(trimmedData[1].position).toBe(1);
            expect(trimmedData[2].position).toBe(4);
            expect(trimmedData[3].position).toBe(5);
        });

        it("Should not be able to shift the first beat", () => {
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
                { duration: 0.5, include_in_measure: 1, notes: "third" },
            ];

            const createBeatsResponse = BeatTable.createBeats({
                newBeats: initialBeats,
                db,
            });
            expect(createBeatsResponse.success).toBe(true);
            const shiftFirstBeat = () => {
                return BeatTable.shiftBeats({
                    db,
                    startingPosition: 0,
                    shiftAmount: 4,
                    useNextUndoGroup: true,
                });
            };
            expect(shiftFirstBeat().success).toBe(false);
        });

        it("should shift beats backward by a negative amount", () => {
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
                { duration: 0.5, include_in_measure: 1, notes: "third" },
                { duration: 0.5, include_in_measure: 1, notes: "fourth" },
            ];

            const createBeatsResponse = BeatTable.createBeats({
                newBeats: initialBeats,
                db,
            });
            expect(createBeatsResponse.success).toBe(true);

            expect(
                BeatTable.shiftBeats({
                    db,
                    startingPosition: 1,
                    shiftAmount: 4,
                    useNextUndoGroup: true,
                }).success,
            ).toBeTruthy();
            const shiftResult = BeatTable.shiftBeats({
                db,
                startingPosition: 5,
                shiftAmount: -4,
                useNextUndoGroup: true,
            });

            expect(shiftResult.success).toBe(true);
            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            console.log(getResult.data);
            expect(
                trimData(
                    getResult.data.filter(
                        (p) => p.id !== BeatTable.FIRST_BEAT_ID,
                    ),
                ),
            ).toEqual(trimData(createBeatsResponse.data));
        });

        it("should not shift beats into negative position", () => {
            const initialBeats: BeatTable.NewBeatArgs[] = [
                { duration: 0.5, include_in_measure: 1, notes: "first" },
                { duration: 0.5, include_in_measure: 1, notes: "second" },
                { duration: 0.5, include_in_measure: 1, notes: "third" },
                { duration: 0.5, include_in_measure: 1, notes: "fourth" },
            ];

            const createBeatsResponse = BeatTable.createBeats({
                newBeats: initialBeats,
                db,
            });
            expect(createBeatsResponse.success).toBe(true);

            const shiftResult = BeatTable.shiftBeats({
                db,
                startingPosition: 0,
                shiftAmount: -4,
                useNextUndoGroup: true,
            });

            expect(shiftResult.success).toBe(false);
            const getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            console.log(getResult.data);
            expect(
                getResult.data.filter((p) => p.id !== BeatTable.FIRST_BEAT_ID),
            ).toEqual(createBeatsResponse.data);
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

            expect(trimmedData[1].position).toBe(4);
            expect(trimmedData[2].position).toBe(5);
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

            expect(trimmedData.length).toBe(3);
            expect(trimmedData[1].position).toBe(1);
            expect(trimmedData[1].notes).toBe("first");
            expect(trimmedData[2].position).toBe(2);
            expect(trimmedData[2].notes).toBe("fourth");
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
            expect(getResult.data.length).toBe(2);
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
            expect(getResult.data.length).toBe(3);
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
            expect(getResult.data.length).toBe(4);

            const redoResult = History.performRedo(db);
            expect(redoResult.success).toBe(true);

            getResult = BeatTable.getBeats({ db });
            expect(getResult.success).toBe(true);
            expect(getResult.data.length).toBe(3);
            const trimmedData = trimData(getResult.data).sort(sorter);
            expect(trimmedData[1].notes).toBe("first");
            expect(trimmedData[2].notes).toBe("third");
        });
    });
});
