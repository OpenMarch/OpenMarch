export function shouldShowUpdateNotification(
    previousVersion: string | null,
    currentVersion: string,
) {
    return previousVersion !== null && previousVersion !== currentVersion;
}
