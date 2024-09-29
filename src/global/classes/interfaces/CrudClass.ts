import { DatabaseResponse } from "electron/database/tables/AbstractTableController";

/**
 * A class that implements the CRUD operations for an database table.
 */
export default interface CrudClass<
    DatabaseItemType,
    NewItemArgs,
    ModifiedItemArgs
> {
    /**
     * Refreshes the store by fetching the items from the database.
     */
    refresh: () => void;
    /**
     * Creates a new item in the database
     * @param newItems The new items to add
     * @returns
     */
    create: (newItems: NewItemArgs[]) => Promise<this[] | undefined>;
    read: (id: number) => Promise<this | undefined>;
    readAll: () => Promise<this[] | undefined>;
    update: (
        id: number,
        data: ModifiedItemArgs[]
    ) => Promise<DatabaseItemType[] | undefined>;
    delete: (id: number) => DatabaseResponse<DatabaseItemType | undefined>;
}
