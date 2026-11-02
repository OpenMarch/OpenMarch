/**
 * How a tag's name reads on screen: its own name, or "tag-N" in the app's language for a tag
 * with no name. Display only; `getTagName` (db-functions) is the same rule in English.
 */
export const tagDisplayName = (
    tag: { tag_id: number; name?: string | null },
    t: (key: string, params: { id: number }) => string,
): string =>
    tag.name != null && tag.name.trim().length > 0
        ? tag.name
        : t("tags.unnamed", { id: tag.tag_id });
