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
    // Replace named entities first
    text = text.replace(
        /&(?:amp|lt|gt|quot|#39|apos);/g,
        (match) => entityMap[match] || match,
    );
    // Replace numeric entities (decimal and hexadecimal) - limit to reasonable ranges
    // Use fromCodePoint for proper Unicode support (handles code points > 0xFFFF)
    text = text.replace(/&#(\d{1,6});/g, (match, num) => {
        const code = parseInt(num, 10);
        if (code >= 0 && code <= 0x10ffff) {
            try {
                return String.fromCodePoint(code);
            } catch {
                // Invalid code point, return original match
                return match;
            }
        }
        return match;
    });
    text = text.replace(/&#x([0-9a-fA-F]{1,6});/g, (match, hex) => {
        const code = parseInt(hex, 16);
        if (code >= 0 && code <= 0x10ffff) {
            try {
                return String.fromCodePoint(code);
            } catch {
                // Invalid code point, return original match
                return match;
            }
        }
        return match;
    });

    // Replace common block-level tags and <br> with line breaks.
    text = text
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n");

    // Strip script and style tags first (including across newlines)
    // Use non-greedy matching (*?) which is safe from ReDoS
    // Limit tag attribute length to prevent excessive backtracking
    text = text.replace(/<script[^>]{0,1000}>[\s\S]*?<\/script>/gi, "");
    text = text.replace(/<style[^>]{0,1000}>[\s\S]*?<\/style>/gi, "");
    // Strip all remaining HTML tags (bounded attribute length to prevent ReDoS)
    text = text.replace(/<[^>]{0,1000}>/g, "");

    return text.replace(/\n{3,}/g, "\n\n").trim();
}
