/**
 * The `accept` for an `<input type="file">`. iPad and iPhone Safari grey out
 * files their picker can't match (custom extensions such as ".fieldots", and
 * even MP3s for "audio/*" on iPadOS 17), so there any file is offered and the
 * import checks what it got. Images keep their filter (it opens the photo
 * picker). Other devices get `accept` unchanged.
 */
export function touchSafeAccept(
    accept: string,
    nav: { userAgent: string; maxTouchPoints?: number } = navigator,
): string {
    const appleTouch =
        /iPad|iPhone|iPod/.test(nav.userAgent) ||
        (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1);
    if (!appleTouch) return accept;
    return accept
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.startsWith("image/"))
        .join(",");
}
