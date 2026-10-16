/**
 * Whether the app runs under Playwright (the browser scenarios or the
 * Electron e2e suite). Scenario-only setup hooks install only then.
 */
export const isPlaywrightSession = (): boolean => {
    try {
        return (
            !!import.meta.env.VITE_PUBLIC_PLAYWRIGHT_SESSION ||
            !!window.electron?.isPlaywrightSession
        );
    } catch {
        return false;
    }
};
