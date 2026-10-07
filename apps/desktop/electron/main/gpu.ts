/**
 * Windows 7 reports OS release "6.1.x". Linux 6.1 kernels report the same prefix,
 * so the platform has to be checked too or Linux loses hardware acceleration.
 */
export function isWindows7(platform: NodeJS.Platform, osRelease: string) {
    return platform === "win32" && osRelease.startsWith("6.1.");
}
