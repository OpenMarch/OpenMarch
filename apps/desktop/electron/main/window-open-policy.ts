// Pure, no electron imports, so Vitest can load it.

/** Always denies in-app windows; https links go to the system browser instead. */
export function handleWindowOpen(
    url: string,
    openExternal: (url: string) => void,
): { action: "deny" } {
    if (url.startsWith("https:")) openExternal(url);
    return { action: "deny" };
}
