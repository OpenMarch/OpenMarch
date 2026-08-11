export const _createSectionMappings = (
    marchers: { section: string | null; drill_prefix: string }[],
): Record<string, string> => {
    const sectionOccurrences: Record<string, Record<string, number>> = {};

    for (const marcher of marchers) {
        const { drill_prefix: prefix, section } = marcher;

        if (section == null) {
            continue;
        }

        if (sectionOccurrences[prefix] == null) {
            sectionOccurrences[prefix] = {};
        }

        sectionOccurrences[prefix][section] =
            (sectionOccurrences[prefix][section] ?? 0) + 1;
    }

    const sectionMappings: Record<string, string> = {};

    for (const [prefix, sectionCounts] of Object.entries(sectionOccurrences)) {
        let mostCommonSection = "";
        let highestCount = -1;

        for (const [section, count] of Object.entries(sectionCounts)) {
            if (count > highestCount) {
                mostCommonSection = section;
                highestCount = count;
            }
        }

        if (mostCommonSection !== "") {
            sectionMappings[prefix] = mostCommonSection;
        }
    }

    return sectionMappings;
};
