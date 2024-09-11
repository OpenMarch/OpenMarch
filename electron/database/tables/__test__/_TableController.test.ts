import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import TableController from "../_TableController";
import Database from "better-sqlite3";

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

// Mock the DatabaseItemType, NewItemArgs, and ModifiedItemArgs types
type DatabaseItemType = {
    id: number;
    name: string;
    age?: number;
    created_at: string;
    updated_at: string;
};
type NewItemArgs = { name: string; age?: number };
type ModifiedItemArgs = { id: number; name?: string; age?: number };

// Mock the TableController class
class MockTableController extends TableController<
    DatabaseItemType,
    NewItemArgs,
    ModifiedItemArgs
> {
    tableName = "mockTable";
    constructor(connect: () => Database.Database) {
        super(connect);
        this.createTable();
    }
    createTable(): void {
        this.connect().exec(`
            CREATE TABLE "${this.tableName}" (
                "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                "name"          TEXT NOT NULL,
                "age"           INTEGER,
                "created_at"    TEXT NOT NULL,
                "updated_at"    TEXT NOT NULL
            );
        `);
    }
}

describe("TableController", () => {
    let tableController: MockTableController;
    let db: Database.Database;

    const createDatabase = () => {
        return new Database(":memory:");
    };

    const deleteDatabase = (db: Database.Database) => {
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
        item: DatabaseItemType;
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

    /**
     * Tests that the function connects to the database, prepares the statement, and closes the database
     *
     * @param fn The function to test
     * @param args The arguments to pass to the function
     */
    const expectToConnectAndDisconnect = (
        fn: (args: any) => any,
        args: any = {}
    ) => {
        const connectSpy = vi.spyOn(tableController, "connect");
        const prepareSpy = vi.spyOn(db, "prepare");
        const closeSpy = vi.spyOn(db, "close");

        fn({ ...args });

        expect(connectSpy).toHaveBeenCalled();
        expect(prepareSpy).toHaveBeenCalled();
        expect(closeSpy).toHaveBeenCalled();
    };

    /**
     * Tests that the function prepares the statement but does not connect or close the database
     *
     * @param fn The function to test
     * @param args The arguments to pass to the function
     */
    const expectNotToConnectAndDisconnect = (
        fn: (args: any) => any,
        args: any = {}
    ) => {
        const connectSpy = vi.spyOn(tableController, "connect");
        const prepareSpy = vi.spyOn(db, "prepare");
        const closeSpy = vi.spyOn(db, "close");

        fn({ ...args, db });

        expect(connectSpy).not.toHaveBeenCalled();
        expect(prepareSpy).toHaveBeenCalled();
        expect(closeSpy).not.toHaveBeenCalled();
    };

    beforeEach(() => {
        db = createDatabase();
        tableController = new MockTableController(() => db);
    });

    afterEach(() => {
        tableController = undefined as any;
        deleteDatabase(db);
        vi.clearAllMocks();
    });

    describe("insert", () => {
        it("should connect and disconnect from the db when not provided", () => {
            expectToConnectAndDisconnect(tableController.insert, {
                items: [{ name: "jeff" }],
            });
        });
        it("should not connect and disconnect from the db when db is provided", () => {
            expectNotToConnectAndDisconnect(tableController.insert, {
                items: [{ name: "jeff" }],
            });
        });

        it("should insert a single item into the table", () => {
            const item = { name: "jeff" };
            const before = Date.now();
            const result = tableController.insert({ items: [item], db });
            const after = Date.now();

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();

            expect(result.data[0].id).toBeGreaterThan(0);
            // created_at and updated_at should be the same since this is an insert
            expect(result.data[0].created_at).toEqual(
                result.data[0].updated_at
            );
            const createdAtMs = new Date(result.data[0].created_at).getTime();
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
            const result = tableController.insert({ items });
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
                    result.data[i].created_at
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
            const result = tableController.insert({ items, db });
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
                    result.data[i].created_at
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
            const items = [
                { name: "jeff", id: 56 },
                { name: "john", age: 12, id: 12 },
            ];
            const result = tableController.insert({ items, db });

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
        it("should connect and disconnect from the db when not provided", () => {
            expectToConnectAndDisconnect(tableController.getAll);
        });
        it("should not connect and disconnect from the db when db is provided", () => {
            expectNotToConnectAndDisconnect(tableController.getAll);
        });

        it("should return all items in the table", () => {
            const items = [
                { id: 1, name: "jeff" },
                { id: 2, name: "bob" },
            ];
            tableController.insert({ items, db });

            const result = tableController.getAll({ db });

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(
                result.data.map(({ created_at, updated_at, ...rest }) => rest)
            ).toEqual(items.map((item) => ({ ...item, age: null })));
            // TODO make it so this test doesn't use the age field
        });
    });
    describe("get", () => {
        it("should connect and disconnect from the db when not provided", () => {
            expectToConnectAndDisconnect(tableController.get, { id: 1 });
        });
        it("should not connect and disconnect from the db when db is provided", () => {
            expectNotToConnectAndDisconnect(tableController.get, { id: 1 });
        });

        it("should return a single item from the table", () => {
            const items = [
                { name: "jeff", id: 23 },
                { name: "bob", age: 23, id: 1 },
            ];
            tableController.insert({ items, db });

            let result = tableController.get({ id: 1, db });
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

            result = tableController.get({ id: 2 });
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            if (result.data === undefined)
                throw new Error("result.data is undefined");
            expect(
                removeMetadata({ item: result.data, removeId: false })
            ).toEqual({ ...items[1], id: 2 });
        });

        it("should return an error if the item does not exist", () => {
            const result = tableController.get({ id: 1, db });

            expect(result.success).toBe(false);
            expect(result.error?.message).toBe(
                'No item with id 1 in table "mockTable"'
            );
            expect(result.data).toBeUndefined();
        });
    });

    describe("update", () => {
        it("should connect and disconnect from the db when not provided", () => {
            expectToConnectAndDisconnect(tableController.insert, {
                items: [{ id: 1, name: "jeff" }],
            });
        });
        it("should not connect and disconnect from the db when db is provided", () => {
            expectNotToConnectAndDisconnect(tableController.insert, {
                items: [{ id: 1, name: "jeff" }],
            });
        });

        it("should update a single item in the table", async () => {
            const item = { name: "jeff" };
            const insertResult = tableController.insert({ items: [item], db });
            const updatedItem: ModifiedItemArgs = { id: 1, name: "bob" };
            const before = Date.now();
            // wait for 1ms to ensure the updated_at field is different
            await new Promise((resolve) => setTimeout(resolve, 1));
            const updateResult = tableController.update({
                items: [updatedItem],
                db,
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
            const getResult = tableController.get({ id: 1, db });
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
            const newItems: NewItemArgs[] = [
                { name: "jeff" },
                { name: "bob", age: 15 },
                { name: "carl", age: 43 },
                { name: "stacy" },
                { name: "jim", age: 22 },
            ];
            const insertResult = tableController.insert({
                items: newItems,
                db,
            });
            const expectedItems: ModifiedItemArgs[] = [
                { id: 1, name: "john", age: 23 },
                { id: 2, name: "jane" },
                { id: 5, age: undefined },
            ];
            const before = Date.now();
            // wait for 1ms to ensure the updated_at field is different
            await new Promise((resolve) => setTimeout(resolve, 1));
            const updateResult = tableController.update({
                items: expectedItems,
                db,
            });
            const after = Date.now();

            expect(updateResult.success).toBe(true);
            expect(updateResult.error).toBeUndefined();
            expect(updateResult.data.length).toBe(3);

            // Manual tests to ensure the items were updated correctly and that items that were not updated were not changed
            const item1 = tableController.get({ id: 1, db }).data;
            if (item1 === undefined) throw new Error("Item 1 is undefined");
            expect(removeMetadata({ item: item1, removeId: false })).toEqual({
                id: 1,
                name: "john",
                age: 23,
            });
            const item2 = tableController.get({ id: 2, db }).data;
            if (item2 === undefined) throw new Error("Item 2 is undefined");
            expect(removeMetadata({ item: item2, removeId: false })).toEqual({
                id: 2,
                name: "jane",
                age: 15,
            });
            const item3 = tableController.get({ id: 3, db }).data;
            if (item3 === undefined) throw new Error("Item 3 is undefined");
            expect(removeMetadata({ item: item3, removeId: false })).toEqual({
                id: 3,
                name: "carl",
                age: 43,
            });
            const item4 = tableController.get({ id: 4, db }).data;
            if (item4 === undefined) throw new Error("Item 4 is undefined");
            expect(removeMetadata({ item: item4, removeId: false })).toEqual({
                id: 4,
                name: "stacy",
                age: null,
            });
            const item5 = tableController.get({ id: 5, db }).data;
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
                expect(updatedItem.updated_at).not.toEqual(
                    originalItem?.updated_at
                );
                const updatedAtMs = new Date(updatedItem.updated_at).getTime();
                expect(updatedAtMs).toBeGreaterThanOrEqual(before);
                expect(updatedAtMs).toBeLessThanOrEqual(after);
            }
        });

        it("should return an error if the id does not exist", () => {
            const result = tableController.update({
                items: [
                    { id: 1, name: "jeff" },
                    { id: 1, name: "john" },
                    { id: 2, name: "qwerty" },
                ],
                db,
            });

            expect(result.success).toBe(false);
            expect(result.error?.message).toEqual(
                'No items with ids [1, 2] in table "mockTable"'
            );
            expect(result.data).toEqual([]);
        });
    });

    describe("delete", () => {
        it("should connect and disconnect from the db when not provided", () => {
            expectToConnectAndDisconnect(tableController.delete, {
                id: 1,
            });
        });
        it("should not connect and disconnect from the db when db is provided", () => {
            expectNotToConnectAndDisconnect(tableController.delete, {
                id: 1,
            });
        });

        it("should delete a single item from the table", () => {
            const items = [
                { name: "jeff", id: 23 },
                { name: "bob", age: 23, id: 1 },
            ];
            tableController.insert({ items, db });

            const removeResult = tableController.delete({ id: 1, db });
            expect(removeResult.success).toBe(true);
            expect(removeResult.error).toBeUndefined();
            if (removeResult.data === undefined)
                throw new Error("removeResult.data is undefined");
            expect(
                removeMetadata({ item: removeResult.data, removeId: false })
            ).toEqual({
                ...items[0],
                age: null,
                id: 1,
            });

            const result = tableController.getAll({ db });
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(
                result.data.map(({ created_at, updated_at, ...rest }) => rest)
            ).toEqual([{ ...items[1], id: 2 }]);
        });

        it("should return an error if the item does not exist", () => {
            const result = tableController.delete({ id: 23 });

            expect(result.success).toBe(false);
            expect(result.error?.message).toBe(
                'No item with id 23 in table "mockTable"'
            );
            expect(result.data).toBeUndefined();
        });
    });
});
