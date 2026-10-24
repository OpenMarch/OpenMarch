/**
 * Video export choices and helpers that differ between the desktop app and
 * the web editor (tablets, weak devices).
 */
import { useEffect, useState } from "react";
import { chooseEncodingTarget, type EncodingTarget } from "./encodingTarget";

export const VIDEO_RESOLUTIONS = [
    { label: "720p", width: 1280, height: 720 },
    { label: "1080p", width: 1920, height: 1080 },
    { label: "4K", width: 3840, height: 2160 },
] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

/**
 * The web offers 720p and 1080p: 4K frames are 33 MB each to render and
 * encode, too much for tablets (an iPad 7th gen has 3 GB for everything).
 */
export function videoResolutionsFor(web: boolean): readonly VideoResolution[] {
    return web
        ? VIDEO_RESOLUTIONS.filter((r) => r.label !== "4K")
        : VIDEO_RESOLUTIONS;
}

/** 720p on the web and tablets (faster, lighter); 1080p otherwise. */
export function defaultVideoResolution(web: boolean, touch: boolean) {
    return web || touch ? "720p" : "1080p";
}

/** 30 fps on the web (half the work of 60); 60 in the desktop app. */
export function defaultVideoFrameRate(web: boolean) {
    return web ? 30 : 60;
}

interface WakeLockSentinelLike {
    release(): Promise<void>;
}
interface NavigatorWithWakeLock {
    wakeLock?: {
        request(type: "screen"): Promise<WakeLockSentinelLike>;
    };
}

/**
 * Keeps the screen on (Screen Wake Lock: Safari 16.4+, and in iPadOS
 * home-screen apps from 18.4; Chrome 84+). The browser drops the lock when
 * the page is hidden, so it is asked for again when the page comes back.
 * Does nothing where unsupported.
 */
export function keepScreenAwake(
    nav: NavigatorWithWakeLock = navigator as NavigatorWithWakeLock,
    doc: Pick<
        Document,
        "visibilityState" | "addEventListener" | "removeEventListener"
    > = document,
): { release: () => void } {
    if (!nav.wakeLock) return { release: () => {} };
    let sentinel: WakeLockSentinelLike | null = null;
    let released = false;
    const request = () => {
        nav.wakeLock!.request("screen").then(
            (lock) => {
                if (released) void lock.release().catch(() => {});
                else sentinel = lock;
            },
            () => {
                // Refused (low battery, not visible): export anyway
            },
        );
    };
    const onVisibility = () => {
        if (doc.visibilityState === "visible" && !released) request();
    };
    request();
    doc.addEventListener("visibilitychange", onVisibility);
    return {
        release: () => {
            released = true;
            doc.removeEventListener("visibilitychange", onVisibility);
            void sentinel?.release().catch(() => {});
            sentinel = null;
        },
    };
}

export type EncodingSupport =
    | { state: "checking" }
    | { state: "ok"; audio: EncodingTarget["audio"]; extension: string }
    | { state: "unsupported" };

/**
 * What this browser can encode at `width`×`height`, checked before the
 * export starts so the dialog can say "the video will be silent" up front.
 * Only checked when `enabled` (the web build).
 */
export function useEncodingSupport(
    width: number,
    height: number,
    enabled: boolean,
): EncodingSupport {
    const [support, setSupport] = useState<EncodingSupport>({
        state: "checking",
    });
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setSupport({ state: "checking" });
        chooseEncodingTarget(width, height, { web: true }).then(
            (target) => {
                if (!cancelled)
                    setSupport({
                        state: "ok",
                        audio: target.audio,
                        extension: target.fileExtension,
                    });
            },
            () => {
                if (!cancelled) setSupport({ state: "unsupported" });
            },
        );
        return () => {
            cancelled = true;
        };
    }, [width, height, enabled]);
    return support;
}

/** Whether the web build can stream the video to disk (OPFS). */
export function canStreamVideoToDisk(): boolean {
    return (
        typeof Worker === "function" &&
        typeof navigator.storage?.getDirectory === "function"
    );
}
