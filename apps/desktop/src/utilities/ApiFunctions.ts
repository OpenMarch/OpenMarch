/**
 * Executes a group of database functions with undo capability
 * @param functionsToExecute An array of database functions to execute sequentially. These should all increment the history group
 * @returns An array of database responses from each executed function
 * @description Runs multiple database functions, rolling back all changes if any function fails
 */
export const GroupFunction = async ({
    functionsToExecute,
    useNextUndoGroup,
}: {
    functionsToExecute: (() => Promise<{ success: boolean }>)[];
    useNextUndoGroup: boolean;
}): Promise<{
    responses: { success: boolean }[];
    success: boolean;
    currentUndoGroup: number;
}> => {
    let functionsExecuted = 0;
    const responses: { success: boolean }[] = [];
    let firstFuncUndoGroup = useNextUndoGroup
        ? -1
        : (await window.electron.getCurrentUndoGroup()).data;

    // Execute all functions in the group
    for (const func of functionsToExecute) {
        const response = await func();
        responses.push(response);
        if (!response.success) {
            console.error(
                "Failed to execute function. Undoing changes...",
                response,
            );
            // If it failed, undo all previous changes
            for (let i = 0; i < functionsExecuted; i++) {
                await window.electron.undo();
            }
            return {
                responses,
                success: false,
                currentUndoGroup: -1,
            };
        }
        functionsExecuted++;
        if (firstFuncUndoGroup <= 0) {
            firstFuncUndoGroup = (await window.electron.getCurrentUndoGroup())
                .data;
        }
    }
    if (firstFuncUndoGroup !== -1)
        // Ensure all functions are part of the same undo group
        await window.electron.flattenUndoGroupsAbove(firstFuncUndoGroup);

    return {
        responses,
        success: true,
        currentUndoGroup: firstFuncUndoGroup,
    };
};
