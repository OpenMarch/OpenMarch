// Random utils that I don't know where else to put

import { toast } from "sonner";
// Light helpers, kept in their own modules so the main process and its workers can load them
// without `sonner` (P9.8).
export { mainProcessLog } from "./mainProcessLog";
export { assert } from "./assert";
/**
 * Logs an error to the console and shows a short toast for people.
 *
 * @param message What went wrong, written for people ("Couldn't change the tag"). Never put a
 * raw error message in it; pass the error in `additional`, which only goes to the console.
 * @param additional The error and anything else useful for debugging. Not shown in the toast.
 *
 * The same message replaces its toast instead of stacking, so a burst of failed edits shows
 * one toast.
 */
export const conToastError = (message: string, ...additional: any[]) => {
    console.error(message, ...additional);
    toast.error(message, { id: `error:${message}` });
};

/**
 * Base64-encodes a string, unlike the browser's `btoa` this is safe for
 * strings containing characters outside the Latin1 range (e.g. accented
 * letters, emoji, or other Unicode text a user may have typed into a
 * drill number/name that ends up embedded in an SVG).
 *
 * `btoa` throws `InvalidCharacterError` for any character outside 0-255,
 * so we UTF-8 encode the string to bytes first.
 */
export const utf8ToBase64 = (str: string): string => {
    const bytes = new TextEncoder().encode(str);
    let binary = "";
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary);
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
