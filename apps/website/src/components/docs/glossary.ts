/**
 * The glossary's entries, read from the Glossary page itself, so a term's hover text can't
 * disagree with its entry. Each entry is a `## Heading` followed by its definition; the hover text
 * is the definition's first sentence, as plain text.
 */
import source from "../../content/docs/guides/reference/glossary.mdx?raw";
import { uiText } from "./uiText";

export const GLOSSARY_URL = "/guides/reference/glossary/";

/** The anchor Starlight gives a heading: lowercase, punctuation dropped, spaces as hyphens. */
export function headingSlug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s/g, "-");
}

function plain(markdown: string): string {
    return markdown
        .replace(/<Ui\b[^>]*?\bk="([^"]+)"[^>]*\/>/g, (_, k: string) =>
            uiText(k),
        )
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[`*]/g, "")
        .trim();
}

/** Abbreviations whose full stop doesn't end a sentence. */
const ABBREVIATION = /\b(?:e\.g|i\.e|etc|vs|Dr|Mr|Ms|St)\.$/i;

function firstSentence(text: string): string {
    // A sentence ends at . ! or ? (plus any closing quote or bracket) followed by a space or the end.
    const end = /[.!?]["'”’)\]]*(?=\s|$)/g;
    for (let match = end.exec(text); match; match = end.exec(text)) {
        const sentence = text.slice(0, match.index + match[0].length);
        if (!ABBREVIATION.test(text.slice(0, match.index + 1))) return sentence;
    }
    return text;
}

let cache: Map<string, { term: string; definition: string }> | undefined;

/** Every entry by its anchor: the term as headed, and the first sentence of its definition. */
export function glossaryEntries() {
    if (cache) return cache;
    cache = new Map();
    for (const block of source.split(/\n## /).slice(1)) {
        const [heading, ...rest] = block.split("\n");
        const paragraph = rest.find((line) => line.trim() !== "") ?? "";
        const slug = headingSlug(heading);
        const definition = firstSentence(plain(paragraph));
        // Fail the build rather than show a wrong or empty hover text.
        if (cache.has(slug))
            throw new Error(
                `Glossary: two entries are headed "${heading.trim()}"`,
            );
        if (!definition)
            throw new Error(`Glossary: "${heading.trim()}" has no definition`);
        if (/[<>{}]/.test(definition))
            throw new Error(
                `Glossary: "${heading.trim()}" starts with markup the hover text can't show: ${definition}`,
            );
        cache.set(slug, { term: heading.trim(), definition });
    }
    return cache;
}
