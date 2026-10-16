/**
 * Windows 7 reports OS release "6.1.x". Linux 6.1 kernels report the same prefix,
 * so the platform has to be checked too or Linux loses hardware acceleration.
 */
export function isWindows7(platform: NodeJS.Platform, osRelease: string) {
    return platform === "win32" && osRelease.startsWith("6.1.");
}

/**
 * Asks the main process whether its GPU process crashed this session
 * (renderer → main, `invoke`, answers a boolean). ADR 0005 D-3.
 */
export const GPU_CRASHED_CHANNEL = "gpu:crashed";
/** Tells every window the GPU process just crashed (main → renderer, no payload). */
export const GPU_PROCESS_GONE_CHANNEL = "gpu:process-gone";

/**
 * Whether a child process that went away (Electron's `child-process-gone`)
 * was the GPU process ending in anything but a clean exit. Chromium restarts
 * it, but the field then drops to low-quality mode (ADR 0005 D-3).
 */
export function isGpuCrash(details: { type: string; reason: string }) {
    return details.type === "GPU" && details.reason !== "clean-exit";
}
