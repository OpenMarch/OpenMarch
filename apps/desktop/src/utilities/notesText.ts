/**
 * Truncates HTML content while preserving formatting tags.
 * Limits by both line count and character count (of plain text).
 */
export function truncateHtmlNotes(
    html: string,
    maxLines: number,
    maxChars: number,
): string {
    if (!html) return "";

    const plainText = notesHtmlToPlainText(html);
    const lines = plainText.split(/\r?\n/);
    const limitedLines = lines.slice(0, maxLines);
    let truncatedPlainText = limitedLines.join("\n");

    if (truncatedPlainText.length > maxChars) {
        truncatedPlainText = truncatedPlainText.slice(0, maxChars);
    }

    if (
        truncatedPlainText.length < plainText.length ||
        limitedLines.length < lines.length
    ) {
        const targetLength = truncatedPlainText.length;
        let currentLength = 0;
        let result = "";
        let inTag = false;
        let inComment = false;
        let tagBuffer = "";
        let entityBuffer = "";
        let inEntity = false;
        const openTags: string[] = [];

        for (let i = 0; i < html.length; i++) {
            const char = html[i];

            // Handle HTML comments
            if (!inTag && html.substring(i, i + 4) === "<!--") {
                inComment = true;
                if (currentLength <= targetLength) {
                    result += html.substring(i, i + 4);
                }
                i += 3;
                continue;
            }
            if (inComment) {
                if (html.substring(i, i + 3) === "-->") {
                    inComment = false;
                    if (currentLength <= targetLength) {
                        result += "-->";
                    }
                    i += 2;
                } else if (currentLength <= targetLength) {
                    result += char;
                }
                continue;
            }

            // Handle HTML entities
            if (!inTag && char === "&") {
                inEntity = true;
                entityBuffer = "&";
                continue;
            }
            if (inEntity) {
                entityBuffer += char;
                if (char === ";") {
                    inEntity = false;
                    // Decode entity to count as single character
                    const decoded = entityBuffer
                        .replace(/&amp;/g, "&")
                        .replace(/&lt;/g, "<")
                        .replace(/&gt;/g, ">")
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'")
                        .replace(/&apos;/g, "'")
                        .replace(/&#(\d{1,6});/g, (match, num) => {
                            const code = parseInt(num, 10);
                            return code >= 0 && code <= 0x10ffff
                                ? String.fromCodePoint(code)
                                : match;
                        })
                        .replace(/&#x([0-9a-fA-F]{1,6});/gi, (match, hex) => {
                            const code = parseInt(hex, 16);
                            return code >= 0 && code <= 0x10ffff
                                ? String.fromCodePoint(code)
                                : match;
                        });

                    if (currentLength < targetLength) {
                        result += entityBuffer;
                        currentLength += decoded.length;
                    } else {
                        break;
                    }
                    entityBuffer = "";
                } else if (!/[a-zA-Z0-9#]/.test(char)) {
                    // Invalid entity character, treat accumulated buffer as regular text
                    inEntity = false;
                    if (currentLength < targetLength) {
                        result += entityBuffer;
                        currentLength += entityBuffer.length;
                    } else {
                        break;
                    }
                    entityBuffer = "";
                    // Process this character normally
                    if (currentLength < targetLength) {
                        result += char;
                        currentLength++;
                    } else {
                        break;
                    }
                }
                continue;
            }

            if (char === "<") {
                inTag = true;
                tagBuffer = "<";
            } else if (char === ">") {
                inTag = false;
                tagBuffer += ">";

                const tagMatch = tagBuffer.match(/<\/?(\w+)/);
                if (tagMatch) {
                    const tagName = tagMatch[1].toLowerCase();
                    const isClosing = tagBuffer.startsWith("</");
                    const isSelfClosing = /\/\s*>$/.test(tagBuffer);

                    if (isClosing) {
                        const lastOpen = openTags.lastIndexOf(tagName);
                        if (lastOpen !== -1) {
                            openTags.splice(lastOpen, 1);
                        }
                        if (currentLength <= targetLength) {
                            result += tagBuffer;
                        }
                    } else if (isSelfClosing) {
                        // Self-closing tags don't need to be tracked
                        if (currentLength <= targetLength) {
                            result += tagBuffer;
                        }
                    } else {
                        if (
                            [
                                "strong",
                                "b",
                                "em",
                                "i",
                                "p",
                                "div",
                                "br",
                                "h1",
                                "h2",
                                "h3",
                                "h4",
                                "h5",
                                "h6",
                                "ul",
                                "ol",
                                "li",
                            ].includes(tagName)
                        ) {
                            openTags.push(tagName);
                            if (currentLength <= targetLength) {
                                result += tagBuffer;
                            }
                        } else if (currentLength <= targetLength) {
                            result += tagBuffer;
                        }
                    }
                } else if (currentLength <= targetLength) {
                    result += tagBuffer;
                }

                tagBuffer = "";
            } else if (inTag) {
                tagBuffer += char;
            } else {
                if (currentLength < targetLength) {
                    result += char;
                    currentLength++;
                } else {
                    break;
                }
            }
        }

        // Close any remaining open tags
        while (openTags.length > 0) {
            const tag = openTags.pop()!;
            result += `</${tag}>`;
        }

        if (
            truncatedPlainText.length < plainText.length ||
            limitedLines.length < lines.length
        ) {
            result += "...";
        }

        return result;
    }

    return html;
}

export function notesHtmlToPlainText(html: string): string {
    if (!html) return "";

    let text = html.replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
        "",
    );
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
    text = text.replace(/&#(\d{1,6});/g, (match, num) => {
        const code = parseInt(num, 10);
        if (code >= 0 && code <= 0x10ffff) {
            try {
                return String.fromCodePoint(code);
            } catch {
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
                return match;
            }
        }
        return match;
    });

    text = text
        .replace(/<\/(p|div|li|h[1-6])\s*>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n");
    let previousLength: number;
    let iterations = 0;
    const maxIterations = 100;
    do {
        previousLength = text.length;
        text = text.replace(
            /<script[^>]{0,1000}>[\s\S]*?<\/script\s*[^>]*>/gi,
            "",
        );
        text = text.replace(
            /<style[^>]{0,1000}>[\s\S]*?<\/style\s*[^>]*>/gi,
            "",
        );
        text = text.replace(/<[^>]{0,1000}>/g, "");
        text = text.replace(/<[a-zA-Z\/!][^>]{0,999}(?!>)/g, "");
        iterations++;
        if (iterations >= maxIterations) {
            break;
        }
    } while (text.length !== previousLength);

    text = text.replace(/[<>]/g, "");

    return text.replace(/\n{3,}/g, "\n\n").trim();
}
