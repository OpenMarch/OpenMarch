export function notesHtmlToPlainText(html: string): string {
    if (!html) return "";

    // Strip control characters that can confuse text rendering (excluding \n, \r, \t).
    let text = html.replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
        "",
    );

    // Decode common HTML entities in a single pass to prevent double-unescaping.
    const entityMap: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'",
        "&apos;": "'",
    };
    text = text.replace(
        /&(?:amp|lt|gt|quot|#39|apos);/g,
        (match) => entityMap[match] || match,
    );

    // Replace common block-level tags and <br> with line breaks.
    text = text
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n");

    // Strip remaining tags more aggressively (including across newlines and script tags).
    text = text.replace(
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        "",
    );
    text = text.replace(/<[^>]+>/gs, "");

    return text.replace(/\n{3,}/g, "\n\n").trim();
}
