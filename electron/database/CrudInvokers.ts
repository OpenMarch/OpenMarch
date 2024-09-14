import { DatabaseResponse } from "./tables/AbstractTableController";

/**
 * Invokers for the database for CRUD Inter-Process Communication.
 *
 * implement this in the `preload/index.ts` file and make the channel {table_name}:{function} (e.g. "marchers:readAll").
 * This cannot be dynamically implement it, you must hard code each CrudInvoker you implement
 */
export default interface CrudInvokers<
    DatabaseItemType,
    NewItemArgs,
    UpdatedItemArgs
> {
    /**
     * Creates new items in the table
     *
     * @param newItems The items to create
     * @returns A DatabaseResponse with the created item
     */
    create: (
        newItem: NewItemArgs[]
    ) => Promise<DatabaseResponse<DatabaseItemType[]>>;
    /**
     * Gets the item with the given id
     *
     * @param id The id of the item to get
     * @returns A DatabaseResponse with the item
     */
    read: (id: number) => Promise<DatabaseResponse<DatabaseItemType>>;
    /**
     * Gets all of the items in the table
     *
     * @returns A DatabaseResponse with all items in the table
     */
    readAll: () => Promise<DatabaseResponse<DatabaseItemType[]>>;
    /**
     * Updates existing items in the table
     *
     * @param modifiedItems The items to update
     * @returns A DatabaseResponse with the updated item
     */
    update: (
        modifiedItems: UpdatedItemArgs[]
    ) => Promise<DatabaseResponse<DatabaseItemType[]>>;
    /**
     * Deletes an item from the table
     *
     * @param id The id of the item to delete
     * @returns A DatabaseResponse with the deleted item
     */
    delete: (id: number) => Promise<DatabaseResponse<DatabaseItemType>>;
}
