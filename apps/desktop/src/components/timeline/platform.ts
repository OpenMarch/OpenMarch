/** macOS, where Ctrl+click is a right-click and Cmd is the modifier */
export const isMac = () =>
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
