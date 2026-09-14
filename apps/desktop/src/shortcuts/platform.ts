export function isMacPlatform(): boolean {
    if (
        typeof window !== "undefined" &&
        window.electron?.isMacOS !== undefined
    ) {
        return window.electron.isMacOS;
    }
    return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
}
