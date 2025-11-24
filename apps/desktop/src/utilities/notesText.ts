export function notesHtmlToPlainText(html: string): string {
    if (!html) return "";
    // Replace common block-level tags and <br> with line breaks, then strip remaining tags.
    let text = html
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n");
    // Repeatedly strip HTML tags until none remain (fixes incomplete multi-char sanitization)
    let previous;
    do {
        previous = text;
        text = text.replace(/<[^>]+>/g, "");
    } while (text !== previous);
    return text.replace(/\n{3,}/g, "\n\n").trim();
}
