/* eslint-disable no-console */
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
