// Random utils that I don't know where else to put

import { toast } from "sonner";
/**
 * Logs to the main process via window.electron.log if available, otherwise falls back to console.log
 */
export const mainProcessLog = (
    level: "log" | "info" | "warn" | "error",
    message: string,
    ...args: any[]
) => {
    if (typeof window !== "undefined" && window.electron?.log) {
        void window.electron.log(level, message, ...args);
    } else {
        console[level](message, ...args);
    }
};

/**
 * Logs an error message to the console and displays a toast error notification.
 *
 * @param message The primary error message to log and display. This goes to the console and toast.
 * @param additional Optional additional parameters to log alongside the message. These will not be displayed in the toast.
 */
export const conToastError = (message: string, ...additional: any[]) => {
    console.error(message, ...additional);
    toast.error(message);
};

/**
 * Asserts that a condition is true without throwing an error.
 *
 * Errors are displayed in the console and toast.
 *
 * @param condition The condition to assert.
 * @param message The message to display if the condition is false.
 */
export const softAssert = (
    condition: boolean,
    message: string,
    displayToast: boolean = true,
): void => {
    if (!condition) {
        console.error(message);
        if (displayToast) toast.error(message);
    }
};

/**
 * Asserts that a condition is true. Meant to mimic assertions in other languages.
 *
 * @param condition The condition to assert.
 * @param message The message to display if the condition is false.
 */
export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
