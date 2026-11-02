import { getTranslatedSectionName, SECTIONS } from "@/global/classes/Sections";

/**
 * How a marcher's stored section name reads on screen: a built-in section's
 * name in the app's language, any other stored name as it is (unlike
 * `getTranslatedSectionName`, which would show it as Other).
 */
export const sectionDisplayName = (
    name: string,
    t: (key: string) => string,
): string =>
    Object.values(SECTIONS).some((section) => section.name === name)
        ? getTranslatedSectionName(name, t)
        : name;
