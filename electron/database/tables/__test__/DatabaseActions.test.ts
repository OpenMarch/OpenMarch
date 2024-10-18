import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as DbActions from "../DatabaseActions";
import {
    createHistoryTables,
    createUndoTriggers,
} from "../../database.history";

// Mock ipcMain and ipcRenderer
vi.mock("electron", () => ({
    ipcRenderer: {
        on: vi.fn(),
        send: vi.fn(),
    },
    BrowserWindow: vi.fn(),
    ipcMain: {
        handle: vi.fn(),
    },
}));

describe("Database Actions", () => {
    type Row = {
        name: string;
        age?: number | null;
        created_at: string;
        updated_at: string;
        id: number;
    };
    type NewRow = { name: string; age?: number | null; id?: number };
    type UpdateRowArgs = { id: number; name?: string; age?: number | null };
    let db: Database.Database;

    const createDatabase = () => {
        return new Database(":memory:");
    };

    const deleteDatabase = (db: Database.Database) => {
        db.prepare(`DROP TABLE IF EXISTS ${mockTableName}`).run();
        db.close();
    };

    /**
     * Helper function to remove metadata from an item
     *
     * @param item The item to remove metadata from
     * @param removeTimestamps true to remove the created_at and updated_at fields
     * @param removeId true to remove the id field
     * @returns An object with the metadata removed
     */
    const removeMetadata = ({
        item,
        removeTimestamps = true,
        removeId = true,
    }: {
        item: Object;
        removeTimestamps?: boolean;
        removeId?: boolean;
    }) => {
        let newItem: any = { ...item };
        if (removeTimestamps) {
            const { created_at, updated_at, ...rest } = newItem;
            newItem = { ...rest };
        }
        if (removeId) {
            const { id, ...rest } = newItem;
            newItem = { ...rest };
        }
        return newItem as Object;
    };

    const mockTableName = "mockTable";
    beforeEach(() => {
        db = createDatabase();
        db.prepare(
            `CREATE TABLE ${mockTableName} (
            id INTEGER PRIMARY KEY,
            name TEXT,
            age INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`
        ).run();
        createHistoryTables(db);
        createUndoTriggers(db, mockTableName);
    });

    afterEach(() => {
        deleteDatabase(db);
        vi.clearAllMocks();
    });

    describe("insert", () => {
        it("should insert a single item into the table", async () => {
            const item = { name: "jeff" };
            const before = Date.now();
            const result = DbActions.createItems<Row, NewRow>({
                tableName: mockTableName,
                items: [item],
                db,
            });
            // sleep for 5ms to ensure the created_at field is different
            await new Promise((resolve) => setTimeout(resolve, 5));
            const after = Date.now();

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();

            expect(result.data[0].id).toBeGreaterThan(0);
            // created_at and updated_at should be the same since this is an insert
            expect(result.data[0].created_at).toEqual(
                result.data[0].updated_at
            );
            const createdAtMs = new Date(
                result.data[0].created_at as string
            ).getTime();
            expect(createdAtMs).toBeGreaterThanOrEqual(before);
            expect(createdAtMs).toBeLessThanOrEqual(after);

            // Remove the created_at, updated_at, and id fields from the actual object
            const { created_at, updated_at, id, ...trimmedActual } =
                result.data[0];
            expect(trimmedActual).toEqual({ ...item, age: null });
        });
        it("should insert many items into the table", () => {
            const items = [{ name: "jeff" }, { name: "bob" }, { name: "carl" }];
            const before = Date.now();
            const result = DbActions.createItems<Row, NewRow>({
                db,
                tableName: mockTableName,
                items,
            });
            const after = Date.now();

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();

            for (let i = 0; i < items.length; i++) {
                expect(result.data[i].id).toBeGreaterThan(0);
                // created_at and updated_at should be the same since this is an insert
                expect(result.data[i].created_at).toEqual(
                    result.data[i].updated_at
                );
                const createdAtMs = new Date(
                    result.data[i].created_at as string
                ).getTime();
                expect(createdAtMs).toBeGreaterThanOrEqual(before);
                expect(createdAtMs).toBeLessThanOrEqual(after);

                // Remove the created_at, updated_at, and id fields from the actual object
                const { created_at, updated_at, id, ...trimmedActual } =
                    result.data[i];
                expect(trimmedActual).toEqual({ ...items[i], age: null });
            }
        });
        it("should insert many items into the table with optional params", () => {
            const items = [
                { name: "jeff", age: 56 },
                { name: "bob", age: undefined },
                { name: "carl", age: 23 },
                { name: "stacy" },
            ];
            const before = Date.now();
            const result = DbActions.createItems<Row, NewRow>({
                tableName: mockTableName,
                items,
                db,
            });
            const after = Date.now();

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();

            for (let i = 0; i < items.length; i++) {
                expect(result.data[i].id).toBeGreaterThan(0);
                // created_at and updated_at should be the same since this is an insert
                expect(result.data[i].created_at).toEqual(
                    result.data[i].updated_at
                );
                const createdAtMs = new Date(
                    result.data[i].created_at as string
                ).getTime();
                expect(createdAtMs).toBeGreaterThanOrEqual(before);
                expect(createdAtMs).toBeLessThanOrEqual(after);

                // Remove the created_at, updated_at, and id fields from the actual object
                const { created_at, updated_at, id, ...trimmedActual } =
                    result.data[i];
                if (trimmedActual.age === null)
                    expect(trimmedActual).toEqual({ ...items[i], age: null });
                else expect(trimmedActual).toEqual(items[i]);
            }
        });
        it("should ignore provided id", () => {
            const items: NewRow[] = [
                { name: "jeff", id: 56 },
                { name: "john", age: 12, id: 12 },
            ];
            const result = DbActions.createItems<Row, NewRow>({
                tableName: mockTableName,
                items,
                db,
            });

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();

            // Expect the id to be auto-generated (1 and 2)
            expect(result.data[0].id).toBe(1);
            expect(result.data[0].name).toBe("jeff");
            expect(result.data[0].age).toBe(null);
            expect(result.data[1].id).toBe(2);
            expect(result.data[1].name).toBe("john");
            expect(result.data[1].age).toBe(12);
        });
    });

    describe("getAll", () => {
        it("should return all items in the table", () => {
            const items = [
                { id: 1, name: "jeff" },
                { id: 2, name: "bob" },
            ];
            DbActions.createItems({ items, db, tableName: mockTableName });

            const result = DbActions.getAllItems({
                db,
                tableName: mockTableName,
            });

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            if (result.data === undefined)
                throw new Error("result.data is undefined");
            expect(
                result.data.map(({ created_at, updated_at, ...rest }) => rest)
            ).toEqual(items.map((item) => ({ ...item, age: null })));
            // TODO make it so this test doesn't use the age field
        });
    });

    describe("get", () => {
        it("should return a single item from the table", () => {
            const items = [
                { name: "jeff", id: 23 },
                { name: "bob", age: 23, id: 1 },
            ];
            DbActions.createItems({ items, db, tableName: mockTableName });

            let result = DbActions.getItem<Row>({
                id: 1,
                db,
                tableName: mockTableName,
            });
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            if (result.data === undefined)
                throw new Error("result.data is undefined");
            expect(
                removeMetadata({ item: result.data, removeId: false })
            ).toEqual({
                ...items[0],
                age: null,
                id: 1,
            });

            result = DbActions.getItem<Row>({
                id: 2,
                db,
                tableName: mockTableName,
            });
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            if (result.data === undefined)
                throw new Error("result.data is undefined");
            expect(
                removeMetadata({ item: result.data, removeId: false })
            ).toEqual({ ...items[1], id: 2 });
        });

        it("should return an error if the item does not exist", () => {
            const result = DbActions.getItem<Row>({
                id: 1,
                db,
                tableName: mockTableName,
            });

            expect(result.success).toBe(false);
            expect(result.error?.message).toBe(
                'No item with "id"=1 in table "mockTable"'
            );
            expect(result.data).toBeUndefined();
        });
    });

    describe("update", () => {
        it("should update a single item in the table", async () => {
            const item = { name: "jeff" };
            const insertResult = DbActions.createItems<Row, NewRow>({
                tableName: mockTableName,
                items: [item],
                db,
            });
            const updatedItem: UpdateRowArgs = { id: 1, name: "bob" };
            const before = Date.now();
            // wait for 5ms to ensure the updated_at field is different
            await new Promise((resolve) => setTimeout(resolve, 5));
            const updateResult = DbActions.updateItems<Row, UpdateRowArgs>({
                items: [updatedItem],
                db,
                tableName: mockTableName,
            });
            const after = Date.now();

            expect(updateResult.success).toBe(true);
            expect(updateResult.error).toBeUndefined();

            // created_at should be the same, updated_at should be different
            expect(updateResult.data[0].created_at).toEqual(
                insertResult.data[0].created_at
            );
            expect(updateResult.data[0].updated_at).not.toEqual(
                insertResult.data[0].updated_at
            );
            const updatedAtMs = new Date(
                updateResult.data[0].updated_at
            ).getTime();
            expect(updatedAtMs).toBeGreaterThanOrEqual(before);
            expect(updatedAtMs).toBeLessThanOrEqual(after);
            expect(
                removeMetadata({ item: updateResult.data[0], removeId: false })
            ).toEqual({
                ...updatedItem,
                age: null,
            });

            // ensure get returns the updated item
            const getResult = DbActions.getItem<Row>({
                id: 1,
                db,
                tableName: mockTableName,
            });
            expect(getResult.success).toBe(true);
            expect(getResult.error).toBeUndefined();
            if (getResult.data === undefined)
                throw new Error("getResult.data is undefined");
            expect(
                removeMetadata({ item: getResult.data, removeId: false })
            ).toEqual({
                ...updatedItem,
                age: null,
                id: 1,
            });
        });

        it("should update many items in the table", async () => {
            const newItems = [
                { name: "jeff" },
                { name: "bob", age: 15 },
                { name: "carl", age: 43 },
                { name: "stacy" },
                { name: "jim", age: 22 },
            ];
            const insertResult = DbActions.createItems({
                tableName: mockTableName,
                items: newItems,
                db,
            });
            const expectedItems = [
                { id: 1, name: "john", age: 23 },
                { id: 2, name: "jane" },
                { id: 5, age: undefined },
            ];
            const before = Date.now();
            // wait for 1ms to ensure the updated_at field is different
            await new Promise((resolve) => setTimeout(resolve, 1));
            const updateResult = DbActions.updateItems<Row, UpdateRowArgs>({
                items: expectedItems,
                db,
                tableName: mockTableName,
            });
            const after = Date.now();

            expect(updateResult.success).toBe(true);
            expect(updateResult.error).toBeUndefined();
            expect(updateResult.data.length).toBe(3);

            // Manual tests to ensure the items were updated correctly and that items that were not updated were not changed
            const item1 = DbActions.getItem<Row>({
                tableName: mockTableName,
                id: 1,
                db,
            }).data;
            if (item1 === undefined) throw new Error("Item 1 is undefined");
            expect(removeMetadata({ item: item1, removeId: false })).toEqual({
                id: 1,
                name: "john",
                age: 23,
            });
            const item2 = DbActions.getItem<Row>({
                tableName: mockTableName,
                id: 2,
                db,
            }).data;
            if (item2 === undefined) throw new Error("Item 2 is undefined");
            expect(removeMetadata({ item: item2, removeId: false })).toEqual({
                id: 2,
                name: "jane",
                age: 15,
            });
            const item3 = DbActions.getItem<Row>({
                tableName: mockTableName,
                id: 3,
                db,
            }).data;
            if (item3 === undefined) throw new Error("Item 3 is undefined");
            expect(removeMetadata({ item: item3, removeId: false })).toEqual({
                id: 3,
                name: "carl",
                age: 43,
            });
            const item4 = DbActions.getItem<Row>({
                tableName: mockTableName,
                id: 4,
                db,
            }).data;
            if (item4 === undefined) throw new Error("Item 4 is undefined");
            expect(removeMetadata({ item: item4, removeId: false })).toEqual({
                id: 4,
                name: "stacy",
                age: null,
            });
            const item5 = DbActions.getItem<Row>({
                tableName: mockTableName,
                id: 5,
                db,
            }).data;
            if (item5 === undefined) throw new Error("Item 5 is undefined");
            expect(removeMetadata({ item: item5, removeId: false })).toEqual({
                id: 5,
                name: "jim",
                age: null,
            });

            // Automated tests to ensure timestamps are correct
            for (const updatedItem of updateResult.data) {
                // created_at should be the same, updated_at should be different
                const originalItem = insertResult.data.find(
                    (item) => item.id === updatedItem.id
                );
                expect(updatedItem.created_at).toEqual(
                    originalItem?.created_at
                );
                // Sleep for 5ms to ensure the updated_at field is different
                await new Promise((resolve) => setTimeout(resolve, 5));
                expect(updatedItem.updated_at).not.toEqual(
                    originalItem?.updated_at
                );
                const updatedAtMs = new Date(updatedItem.updated_at).getTime();
                expect(updatedAtMs).toBeGreaterThanOrEqual(before);
                expect(updatedAtMs).toBeLessThanOrEqual(after);
            }
        });

        it("should return an error if the id does not exist", () => {
            const result = DbActions.updateItems<Row, UpdateRowArgs>({
                items: [
                    { id: 1, name: "jeff" },
                    { id: 1, name: "john" },
                    { id: 2, name: "qwerty" },
                ],
                db,
                tableName: mockTableName,
            });

            expect(result.success).toBe(false);
            expect(result.error?.message).toEqual(
                'No items with ids [1, 2] in table "mockTable"'
            );
            expect(result.data).toEqual([]);
        });
    });

    describe("delete", () => {
        it("should delete a single item from the table", () => {
            const items = [
                { name: "jeff", id: 23 },
                { name: "bob", age: 23, id: 1 },
            ];
            DbActions.createItems<Row, NewRow>({
                items,
                db,
                tableName: mockTableName,
            });

            const removeResult = DbActions.deleteItems({
                ids: new Set([1]),
                db,
                tableName: mockTableName,
            });
            expect(removeResult.success).toBe(true);
            expect(removeResult.error).toBeUndefined();
            if (removeResult.data === undefined)
                throw new Error("removeResult.data is undefined");
            const trimmedData = removeResult.data.map((item) =>
                removeMetadata({ item, removeId: false })
            );
            expect(trimmedData).toEqual([
                {
                    name: "jeff",
                    age: null,
                    id: 1,
                },
            ]);

            const result = DbActions.getAllItems({
                db,
                tableName: mockTableName,
            });
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(
                result.data!.map(({ created_at, updated_at, ...rest }) => rest)
            ).toEqual([{ ...items[1], id: 2 }]);
        });

        it("should delete a group of marchers", () => {
            const items = [
                { name: "jeff", age: null, id: 1 },
                { name: "bob", age: null, id: 2 },
                { name: "sam", age: 4, id: 3 },
                { name: "jenna", age: 45, id: 4 },
            ];
            DbActions.createItems<Row, NewRow>({
                items,
                db,
                tableName: mockTableName,
            });

            const removeResult = DbActions.deleteItems({
                ids: new Set([1, 3]),
                db,
                tableName: mockTableName,
            });
            expect(removeResult.success).toBe(true);
            expect(removeResult.error).toBeUndefined();
            if (removeResult.data === undefined)
                throw new Error("removeResult.data is undefined");
            let trimmedData = removeResult.data.map((item) =>
                removeMetadata({ item, removeId: false })
            );
            expect(trimmedData).toEqual([items[0], items[2]]);

            const dbContents = DbActions.getAllItems({
                db,
                tableName: mockTableName,
            });
            if (dbContents.data === undefined)
                throw new Error("dbContents.data is undefined");
            trimmedData = dbContents.data.map((item) =>
                removeMetadata({ item, removeId: false })
            );
            expect(trimmedData).toEqual([items[1], items[3]]);
        });

        it("should not delete anything when any of the provided ids are not defined", () => {
            const items = [
                { name: "jeff", age: null, id: 1 },
                { name: "bob", age: 23, id: 2 },
                { name: "sam", age: null, id: 3 },
                { name: "jenna", age: 45, id: 4 },
            ];
            DbActions.createItems<Row, NewRow>({
                items,
                db,
                tableName: mockTableName,
            });

            const removeResult = DbActions.deleteItems({
                ids: new Set([1, 2, 3, 5]),
                db,
                tableName: mockTableName,
            });
            expect(removeResult.success).toBe(false);
            expect(removeResult.error).toBeDefined();
            expect(removeResult.data).toEqual([]);

            const dbContents = DbActions.getAllItems({
                db,
                tableName: mockTableName,
            });
            if (dbContents.data === undefined)
                throw new Error("dbContents.data is undefined");
            const trimmedData = dbContents.data.map((item) =>
                removeMetadata({ item, removeId: false })
            );
            expect(trimmedData).toEqual(items);
        });
    });
});
