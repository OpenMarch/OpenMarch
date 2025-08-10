import type { DatabaseResponse } from "../../../electron/database/DatabaseActions";

/**
 * Generic adapter to convert Promise<T> to DatabaseResponse<T>
 * This is a temporary solution during migration from IPC bridge to shared SQL bridge
 * until we can group operations better with transactions
 */
export async function promiseToDatabaseResponse<T>(
    promiseFn: () => Promise<T>,
): Promise<DatabaseResponse<T>> {
    try {
        const data = await promiseFn();
        return {
            success: true,
            data,
        };
    } catch (error: any) {
        return {
            success: false,
            data: undefined as unknown as T,
            error: {
                message: error.message || "Unknown error occurred",
                stack: error.stack || "",
            },
        };
    }
}
