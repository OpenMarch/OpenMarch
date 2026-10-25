/** The parts of `navigator` the device checks read (tests pass their own). */
export interface NavigatorLike {
    userAgent: string;
    maxTouchPoints?: number;
}

/**
 * Whether this is an iPad, iPhone or iPod. iPadOS Safari says it is a Mac,
 * so a "Macintosh" with a touch screen counts too (Macs have none).
 */
export function isAppleTouchDevice(nav: NavigatorLike = navigator): boolean {
    if (/iPad|iPhone|iPod/.test(nav.userAgent)) return true;
    return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * Whether the browser has the origin private file system and workers to
 * write to it, e.g. to stream a video export to disk instead of memory.
 */
export function hasOpfs(): boolean {
    return (
        typeof Worker === "function" &&
        typeof navigator.storage?.getDirectory === "function"
    );
}
