export function notesHtmlToPlainText(html: string): string {
    if (!html) return "";
    // Replace common block-level tags and <br> with line breaks, then strip remaining tags.
    let text = html
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<[^>]+>/g, "");
    return text.replace(/\n{3,}/g, "\n\n").trim();
}
