import { Constants } from '../../src/global/Constants';
import * as Interfaces from '../../src/global/Interfaces';
import Database from 'better-sqlite3';
import { connect } from './database.services';

/* ============================ Interfaces ============================ */
/**
 * HistoryEntry without the reverse_action field.
 * I.e. putting a reverse_action for the action itself would create a circular reference.
 * This should not be used for the objects going into the undo and redo tables.
 */
interface HistoryEntryBase {
    id?: number;
    action: string;
    table_name: string;
    set_clause?: string;
    data: string | Interfaces.Marcher | Interfaces.Page | Interfaces.MarcherPage | { id: number } | { marcher_id: number, page_id: number };
    history_group_order?: number;
}

/**
 * Defines the fields of a history state for the undo and redo tables.
 * Objects of this type are what will go into the undo and redo tables.
 */
export interface HistoryEntry extends HistoryEntryBase {
    reverse_action: HistoryEntryBase;
}

/**
 * Update history entry without the reverse_action field.
 * I.e. putting a reverse_action for the action itself would create a circular reference.
 */
interface UpdateHistoryEntryBase {
    tableName: string;
    setClause: string;
    previousState: Interfaces.Marcher | Interfaces.Page | Interfaces.MarcherPage;
}

/**
 * Defines the fields of a history state when a marcher, page, or marcherPage is updated.
 * This is will be parsed into a HistoryEntry and put into the undo and redo tables.
 */
export interface UpdateHistoryEntry extends UpdateHistoryEntryBase {
    reverseAction: UpdateHistoryEntryBase;
}

/**
 * Defines the fields of a history state when a marcher, page, or marcherPage is updated.
 * This is will be parsed into a HistoryEntry and put into the undo and redo tables.
 */
export interface InsertHistoryEntry {
    tableName: string;
    id: number;
    reverseAction: {
        tableName: string,
        previousState: Interfaces.Marcher | Interfaces.Page | Interfaces.MarcherPage
    };
}

/* ============================ Exported Functions ============================ */
export function createHistoryTables(db: Database.Database) {
    const tableStr = `
        CREATE TABLE IF NOT EXISTS "{TableName}" (
            "id" INTEGER NOT NULL UNIQUE,
            "action" TEXT NOT NULL,
            "timestamp" DATETIME DEFAULT CURRENT_TIMESTAMP,
            "table_name" TEXT NOT NULL,
            "set_clause" TEXT,
            "data" TEXT,
            "reverse_action" TEXT NOT NULL,
            "history_action_group" INTEGER NOT NULL,
            "history_group_order" INTEGER NOT NULL,
            UNIQUE ("history_action_group", "history_group_order")
            PRIMARY KEY("id" AUTOINCREMENT)
        );
    `
    db.exec(tableStr.replace('{TableName}', Constants.UndoHistoryTableName));
    db.exec(tableStr.replace('{TableName}', Constants.RedoHistoryTableName));
}
/**
 * Pops the last action off of the undo or redo table and executes it (resets to original state/undo).
 *
 * @param type 'undo' or 'redo'
 * @param db database connection
 * @returns - {success: boolean, undo_id: number, history_data: { tableName: string, marcher_id: number, page_id: number }}
 */
export async function historyAction(type: 'undo' | 'redo', db?: Database.Database) {
    const dbToUse = db || connect();
    let output;

    try {
        const HistoryTableName = type === 'undo' ? Constants.UndoHistoryTableName : Constants.RedoHistoryTableName;

        // pull the last action off of the history table. Acts like a stack.
        const selectStmt = dbToUse.prepare(`
            SELECT * FROM ${HistoryTableName}
            WHERE history_action_group = (SELECT MAX(history_action_group) FROM ${HistoryTableName})
        `);
        const results = (selectStmt.all() as HistoryEntry[])
            .sort((a: HistoryEntry, b: HistoryEntry) => b.history_group_order! - a.history_group_order!);
        // console.log(results);
        if (results.length === 0) {
            console.log("Nothing to " + type);
            return {
                success: true
            }
        }

        // The ID of the marcher or page that was updated. -1 by default and changes depending on the action.
        let marcher_id: number = -1;
        let page_id: number = -1;
        if (!results) {
            console.log('No actions to ' + type);
            return;
        }

        // Array of actions to reverse the action that was just popped off of the history table
        const reverseActions: HistoryEntry[] = [];
        results.forEach(result => {
            // parse the history entry
            const historyQuery: HistoryEntry = {
                id: result.id,
                action: result.action,
                table_name: result.table_name,
                set_clause: result.set_clause,
                data: JSON.parse((result.data as string)),
                reverse_action: JSON.parse((result.reverse_action as unknown as string))
            };

            // Translate the history entry into a query for a given action
            if (historyQuery.action === 'UPDATE') {
                const updateQuery: UpdateHistoryEntry = {
                    tableName: historyQuery.table_name,
                    setClause: historyQuery.set_clause as string,
                    previousState: historyQuery.data as Interfaces.Marcher | Interfaces.Page | Interfaces.MarcherPage,
                    reverseAction: {
                        tableName: historyQuery.reverse_action.table_name,
                        setClause: historyQuery.reverse_action.set_clause as string,
                        previousState: historyQuery.reverse_action.data as
                            Interfaces.Marcher | Interfaces.Page | Interfaces.MarcherPage,
                    }
                }

                // record the id of the marcher or page that was updated
                switch (historyQuery.table_name) {
                    case Constants.MarcherTableName:
                        marcher_id = (updateQuery.previousState as Interfaces.Marcher).id;
                        break;
                    case Constants.PageTableName:
                        page_id = (updateQuery.previousState as Interfaces.Page).id;
                        break;
                    case Constants.MarcherPageTableName:
                        marcher_id = (updateQuery.previousState as Interfaces.MarcherPage).marcher_id;
                        page_id = (updateQuery.previousState as Interfaces.MarcherPage).page_id;
                        break;
                    default:
                        throw new Error(`historyQuery.table_name is invalid: ${historyQuery.table_name}`);
                }

                const historyStmt = dbToUse.prepare(`
                    UPDATE ${updateQuery.tableName}
                    SET ${updateQuery.setClause}
                    WHERE id = ${updateQuery.previousState.id}
                `);
                historyStmt.run(updateQuery.previousState as unknown as string);
            } else {
                throw new Error(`historyStmt is undefined for action ${historyQuery.action}`);
            }

            // ** Add the reverse action to the opposite history table
            // remove the reverse_action field from the historyQuery to avoid circular references
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { reverse_action, ...historyQueryWithoutReverse } = historyQuery;
            reverseActions.push({
                ...(historyQuery.reverse_action),
                reverse_action: { ...(historyQueryWithoutReverse) }
            });
            // insertHistory(type === 'undo' ? 'redo' : 'undo', [{
            //     ...(historyQuery.reverse_action),
            //     reverse_action: { ...(historyQueryWithoutReverse) }
            // }], dbToUse, true);

            // Delete the history entry from the history table (like popping from a stack)
            const deleteStmt = dbToUse.prepare(`
                DELETE FROM ${HistoryTableName}
                WHERE id = @id
            `);
            deleteStmt.run({ id: historyQuery.id });
        })
        insertHistory(type === 'undo' ? 'redo' : 'undo', reverseActions, dbToUse, true);

        output = {
            success: true,
            history_data: {
                tableName: results[0].table_name,
                marcher_id, page_id
            }
        };
    } catch (error: unknown) {
        console.error(error);
        let errorMessage = '';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        output = { success: false, errorMessage: errorMessage };
    } finally {
        if (!db) dbToUse.close();
    }
    return output;
}

/**
 * Insert an UPDATE action into the undo or redo table.
 *
 * @param args UpdateHistoryEntry object
 * @param db database connection
 * @param type 'undo' or 'redo'
 * @returns - {success: boolean, errorMessage?: string}
 */
export async function insertUpdateHistory(updateEntries: UpdateHistoryEntry[], db?: Database.Database, type: 'undo' | 'redo' = 'undo') {
    const historyEntries: HistoryEntry[] = [];
    updateEntries.forEach(entry => {
        historyEntries.push({
            action: 'UPDATE',
            table_name: entry.tableName,
            set_clause: entry.setClause,
            data: entry.previousState,
            reverse_action: {
                action: 'UPDATE',
                table_name: entry.reverseAction.tableName,
                set_clause: entry.reverseAction.setClause,
                data: entry.reverseAction.previousState
            }
        })
    });
    return await insertHistory(type, historyEntries, db);
}

/**
 * Insert an INSERT action into the undo or redo table.
 *
 * @param args UpdateHistoryEntry object
 * @param db database connection
 * @param type 'undo' or 'redo'
 * @returns - {success: boolean, errorMessage?: string}
 */
export async function insertInsertHistory(updateEntries: UpdateHistoryEntry[], db?: Database.Database, type: 'undo' | 'redo' = 'undo') {
    const historyEntries: HistoryEntry[] = [];
    updateEntries.forEach(entry => {
        historyEntries.push({
            action: 'INSERT',
            table_name: entry.tableName,
            data: entry.previousState,
            reverse_action: {
                action: 'UPDATE',
                table_name: entry.reverseAction.tableName,
                data: entry.reverseAction.previousState
            }
        })
    });
    return await insertHistory(type, historyEntries, db);
}

/* ============================ Internal Functions ============================ */
/**
 * Inserts a HistoryEntry object into the undo or redo table.
 *
 * @param type 'undo' or 'redo'
 * @param historyEntry HistoryEntry - the entry to insert into the history table
 * @param db database connection
 * @returns
 */
async function insertHistory(type: 'undo' | 'redo', historyEntries: HistoryEntry[], db?: Database.Database, fromReverseAction = false) {
    // console.log('insertHistory:', type, historyEntries);
    const dbToUse = db || connect();

    // Delete the redo table when another action is performed
    if (type === 'undo' && !fromReverseAction) {
        try {
            const deleteStmt = dbToUse.prepare(`DELETE FROM history_redo`);
            deleteStmt.run();
        } catch (error: unknown) {
            console.error(error);
        }
    }

    const HistoryTableName = type === 'undo' ? Constants.UndoHistoryTableName : Constants.RedoHistoryTableName;

    const stmt = dbToUse.prepare(`SELECT MAX("history_action_group") as groupMax FROM ${HistoryTableName}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = stmt.get();
    const newGroupId = result.groupMax + 1;

    for (let i = 0; i < historyEntries.length; i++) {
        const stmt = dbToUse.prepare(`
            INSERT INTO ${HistoryTableName} (
                action,
                table_name,
                set_clause,
                data,
                reverse_action,
                history_action_group,
                history_group_order
            ) VALUES (
                @action,
                @table_name,
                @set_clause,
                @data,
                @reverse_action,
                @history_action_group,
                @history_group_order
            )
        `);
        stmt.run({
            ...historyEntries[i],
            data: JSON.stringify(historyEntries[i].data),
            reverse_action: JSON.stringify(historyEntries[i].reverse_action),
            history_action_group: newGroupId,
            history_group_order: i
        });
    }
    if (!db) dbToUse.close();
    return 200;
}
