// Random utils that I don't know where else to put

import { toast } from "sonner";

/**
 * Logs an error message to the console and displays a toast error notification.
 *
 * @param message The primary error message to log and display. This goes to the console and toast.
 * @param additional Optional additional parameters to log alongside the message. These will not be displayed in the toast.
 */
export const conToastError = (message: string, ...additional: any[]) => {
    console.log(message, ...additional);
    toast.error(message);
};

/**
 * Asserts that a condition is true. Meant to mimic assertions in other languages.
 *
 * @param condition The condition to assert.
 * @param message The message to display if the condition is false.
 */
export const assert = (
    condition: boolean,
    message: string,
    displayToast: boolean = true,
) => {
    if (!condition) {
        console.error(message);
        if (displayToast) toast.error(message);
    }
};
