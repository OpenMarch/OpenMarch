/**
 * "Add to Home Screen" on an iPad. Safari may clear what a website keeps
 * after a week without a visit; an app added to the Home Screen keeps its
 * own storage, and the browser is more willing to keep it when space runs
 * low. So the web editor suggests it once, in Safari on an iPad.
 */

export const HOME_SCREEN_PROMPT_KEY = "openmarch-web:homeScreenPromptShown";

/** Whether the page runs as a Home Screen app (no Safari bars). */
export function isStandalone(): boolean {
    const nav = navigator as Navigator & { standalone?: boolean };
    return (
        nav.standalone === true ||
        (typeof window.matchMedia === "function" &&
            window.matchMedia("(display-mode: standalone)").matches)
    );
}

/** Whether to show the how-to: once, in Safari on an iPad or iPhone. */
export function shouldOfferHomeScreen({
    appleTouch,
    standalone,
    alreadyShown,
}: {
    appleTouch: boolean;
    standalone: boolean;
    alreadyShown: boolean;
}): boolean {
    return appleTouch && !standalone && !alreadyShown;
}
