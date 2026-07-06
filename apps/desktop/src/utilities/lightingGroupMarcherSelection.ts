import Marcher from "@/global/classes/Marcher";
import {
    FAMILIES,
    getSectionObjectByName,
    type SectionFamily,
} from "@/global/classes/Sections";

/** Sections represented in `marchers`, sorted consistently with the editor toolbar. */
export function sectionsFromMarchers(marchers: readonly Marcher[]) {
    const sectionStrings = new Set(marchers.map((marcher) => marcher.section));
    return Array.from(sectionStrings)
        .map((sectionString) => getSectionObjectByName(sectionString))
        .sort((a, b) => a.compareTo(b));
}

export function getMarcherIdsBySectionName(
    marchers: readonly Marcher[],
    sectionName: string,
): number[] {
    return marchers
        .filter((marcher) => marcher.section === sectionName)
        .map((marcher) => marcher.id);
}

/** All marching members of `family` that appear on `marchers`. */
export function getMarcherIdsByFamily(
    marchers: readonly Marcher[],
    family: SectionFamily,
): number[] {
    const sections = sectionsFromMarchers(marchers);
    const sectionNamesInFamily = new Set(
        sections
            .filter((section) => section.family.name === family.name)
            .map((section) => section.name),
    );
    return marchers
        .filter((marcher) => sectionNamesInFamily.has(marcher.section))
        .map((marcher) => marcher.id);
}

export function getFamiliesInShow(): SectionFamily[] {
    return Object.values(FAMILIES);
}

export function getDistinctSortedDrillPrefixesFromMarchers(
    marchers: readonly Marcher[],
): string[] {
    return [...new Set(marchers.map((m) => m.drill_prefix))].sort();
}

export function getMarcherIdsByDrillPrefix(
    marchers: readonly Marcher[],
    drillPrefix: string,
): number[] {
    return marchers
        .filter((marcher) => marcher.drill_prefix === drillPrefix)
        .map((marcher) => marcher.id);
}
