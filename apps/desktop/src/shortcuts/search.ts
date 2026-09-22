/**
 * Word-based search shared by the command palette and the shortcut settings.
 * Every query word must appear in one of the fields; "move up" matches "Move selected marcher(s) up".
 */
export function searchScore(
    query: string,
    fields: readonly string[],
): number | undefined {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;
    const haystacks = fields.map((field) => field.toLowerCase());
    let score = 0;
    for (const word of words) {
        let best = -1;
        haystacks.forEach((haystack, fieldIndex) => {
            // Earlier fields (the label) outrank later ones (category, keywords).
            const fieldWeight = fieldIndex === 0 ? 2 : 1;
            // Score the best occurrence: "port" in "import portfolio" is a word start, not a substring.
            for (
                let index = haystack.indexOf(word);
                index !== -1;
                index = haystack.indexOf(word, index + 1)
            ) {
                const position =
                    index === 0 ? 3 : /\W/.test(haystack[index - 1]) ? 2 : 1;
                best = Math.max(best, position * fieldWeight);
            }
        });
        if (best === -1) return undefined;
        score += best;
    }
    return score;
}

/**
 * Items matching `query`, best first; ties keep their original order.
 * `boost` adds to a match's score, e.g. to favour frequently used commands.
 */
export function searchItems<T>(
    items: readonly T[],
    query: string,
    fields: (item: T) => readonly string[],
    boost: (item: T) => number = () => 0,
): T[] {
    if (query.trim() === "") return [...items];
    return items
        .map((item, index) => {
            const score = searchScore(query, fields(item));
            return {
                item,
                index,
                score: score === undefined ? undefined : score + boost(item),
            };
        })
        .filter(
            (entry): entry is { item: T; index: number; score: number } =>
                entry.score !== undefined,
        )
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.item);
}
