import { beforeEach, describe, expect, it, vi } from "vitest";
import { initTestDatabase } from "./testUtils";
import Database from "better-sqlite3";
import * as MeasureTable from "../MeasureTable";
import * as BeatTable from "../BeatTable";
import Beat from "@/global/classes/Beat";

// Helper function to trim timestamps from measure objects for comparison
const trimData = (data: any[]) =>
    data.map((measure: any) => {
        const { created_at, updated_at, ...rest } = measure;
        return {
            ...rest,
            rehearsal_mark: rest.rehearsal_mark ? rest.rehearsal_mark : null,
            notes: rest.notes ? rest.notes : null,
        };
    });

describe("MeasureTable", () => {
    let db: Database.Database;

    beforeEach(() => {
        db = initTestDatabase();

        // Create some beats that we can use for measures
        const newBeats: BeatTable.NewBeatArgs[] = [
            { duration: 0.5, include_in_measure: 1 },
            { duration: 0.5, include_in_measure: 1 },
            { duration: 0.5, include_in_measure: 1 },
            { duration: 0.5, include_in_measure: 1 },
        ];
        BeatTable.createBeats({ newBeats, db });
    });

    describe("createMeasures", () => {
        it("should insert new measures into an empty database", () => {
            const newMeasures: MeasureTable.NewMeasureArgs[] = [
                { start_beat: 1 },
                { start_beat: 3, rehearsal_mark: "A", notes: "chorus" },
            ];

            const expectedMeasures = [
                {
                    id: 1,
                    start_beat: 1,
                    rehearsal_mark: null,
                    notes: null,
                },
                {
                    id: 2,
                    start_beat: 3,
                    rehearsal_mark: "A",
                    notes: "chorus",
                },
            ];

            const result = MeasureTable.createMeasures({ newMeasures, db });
            expect(result.success).toBe(true);

            const getResult = MeasureTable.getMeasures({ db });
            expect(getResult.success).toBe(true);
            const trimmedData = trimData(getResult.data);
            expect(trimmedData).toEqual(expectedMeasures);
        });

        it("should handle empty array of measures", () => {
            const newMeasures: MeasureTable.NewMeasureArgs[] = [];

            const result = MeasureTable.createMeasures({ newMeasures, db });
            expect(result.success).toBe(true);
            expect(result.data.length).toBe(0);

            const getResult = MeasureTable.getMeasures({ db });
            expect(getResult.success).toBe(true);
            expect(getResult.data.length).toBe(0);
        });
    });

    describe("getMeasures", () => {
        it("should return all measures from the database", () => {
            const newMeasures: MeasureTable.NewMeasureArgs[] = [
                { start_beat: 1 },
                { start_beat: 2, rehearsal_mark: "A" },
                { start_beat: 3, notes: "important section" },
            ];

            MeasureTable.createMeasures({ newMeasures, db });

            const result = MeasureTable.getMeasures({ db });
            expect(result.success).toBe(true);
            expect(result.data.length).toBe(3);

            const trimmedData = trimData(result.data);
            expect(trimmedData[0].start_beat).toBe(1);
            expect(trimmedData[1].rehearsal_mark).toBe("A");
            expect(trimmedData[2].notes).toBe("important section");
        });

        it("should return empty array when no measures exist", () => {
            const result = MeasureTable.getMeasures({ db });
            expect(result.success).toBe(true);
            expect(result.data.length).toBe(0);
        });
    });

    describe("getMeasureById", () => {
        it("should return a specific measure by id", () => {
            const newMeasures: MeasureTable.NewMeasureArgs[] = [
                { start_beat: 1 },
                { start_beat: 2, rehearsal_mark: "B", notes: "verse" },
            ];

            MeasureTable.createMeasures({ newMeasures, db });

            const result = MeasureTable.getMeasureById({ db, id: 2 });
            expect(result.success).toBe(true);

            if (result.data) {
                const { created_at, updated_at, ...measure } = result.data;
                expect(measure).toEqual({
                    id: 2,
                    start_beat: 2,
                    rehearsal_mark: "B",
                    notes: "verse",
                });
            }
        });

        it("should return undefined for non-existent measure id", () => {
            const result = MeasureTable.getMeasureById({ db, id: 999 });
            expect(result.success).toBe(false);
            expect(result.data).toBeUndefined();
        });
    });

    describe("updateMeasures", () => {
        it("should update existing measures", () => {
            const newMeasures: MeasureTable.NewMeasureArgs[] = [
                { start_beat: 1 },
                { start_beat: 3, rehearsal_mark: "A" },
            ];

            MeasureTable.createMeasures({ newMeasures, db });

            const modifiedMeasures: MeasureTable.ModifiedMeasureArgs[] = [
                { id: 1, start_beat: 2, notes: "updated notes" },
                { id: 2, rehearsal_mark: "B" },
            ];

            const updateResult = MeasureTable.updateMeasures({
                db,
                modifiedMeasures,
            });
            expect(updateResult.success).toBe(true);

            const getResult = MeasureTable.getMeasures({ db });
            expect(getResult.success).toBe(true);

            const trimmedData = trimData(getResult.data);
            expect(trimmedData[0].start_beat).toBe(2);
            expect(trimmedData[0].notes).toBe("updated notes");
            expect(trimmedData[1].rehearsal_mark).toBe("B");
        });

        it("should return error when updating non-existent measure", () => {
            const modifiedMeasures: MeasureTable.ModifiedMeasureArgs[] = [
                { id: 999, start_beat: 2 },
            ];

            const result = MeasureTable.updateMeasures({
                db,
                modifiedMeasures,
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe("deleteMeasures", () => {
        it("should delete multiple measures", () => {
            const newMeasures: MeasureTable.NewMeasureArgs[] = [
                { start_beat: 1 },
                { start_beat: 2 },
                { start_beat: 3 },
                { start_beat: 4 },
            ];

            MeasureTable.createMeasures({ newMeasures, db });

            const deleteResult = MeasureTable.deleteMeasures({
                db,
                measureIds: new Set([2, 3]),
            });

            expect(deleteResult.success).toBe(true);

            const getResult = MeasureTable.getMeasures({ db });
            expect(getResult.success).toBe(true);
            expect(getResult.data.length).toBe(2);

            const trimmedData = trimData(getResult.data);
            expect(trimmedData[0].id).toBe(1);
            expect(trimmedData[1].id).toBe(4);
        });

        it("should handle deletion of non-existent measures gracefully", () => {
            const newMeasures: MeasureTable.NewMeasureArgs[] = [
                { start_beat: 1 },
            ];

            MeasureTable.createMeasures({ newMeasures, db });

            const deleteResult = MeasureTable.deleteMeasures({
                db,
                measureIds: new Set([999, 1000]),
            });

            expect(deleteResult.success).toBe(false);

            const getResult = MeasureTable.getMeasures({ db });
            expect(getResult.success).toBe(true);
            expect(getResult.data.length).toBe(1);
        });

        it("should handle deletion of empty set of measureIds", () => {
            const newMeasures: MeasureTable.NewMeasureArgs[] = [
                { start_beat: 1 },
                { start_beat: 2 },
            ];

            MeasureTable.createMeasures({ newMeasures, db });

            const deleteResult = MeasureTable.deleteMeasures({
                db,
                measureIds: new Set(),
            });

            expect(deleteResult.success).toBe(true);

            const getResult = MeasureTable.getMeasures({ db });
            expect(getResult.success).toBe(true);
            expect(getResult.data.length).toBe(2);
        });
    });

    vi.mock("../../../../src/global/classes/Beat", () => ({
        default: class MockBeat {
            id: number;
            timestamp: number;
            position: { x: number; y: number };

            constructor(
                id: number,
                timestamp: number,
                position = { x: 0, y: 0 },
            ) {
                this.id = id;
                this.timestamp = timestamp;
                this.position = position;
            }
        },
        beatsDuration: vi.fn().mockImplementation(() => 1000), // Mock returning 1000ms duration
        compareBeats: (a: Beat, b: Beat) => a.position - b.position,
    }));
});
