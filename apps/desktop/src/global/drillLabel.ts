import {
    COMMON_DRILL_LABEL_PREFIXES,
    parseDrillLabel,
    type ParsedDrillLabel,
} from "@openmarch/drill-interop";
import { SECTIONS } from "@/global/classes/Sections";

export type { ParsedDrillLabel };

/** Derived args for a new marcher from an imported drill label. */
export interface DerivedMarcher {
    section: string;
    drill_prefix: string;
    drill_order: number;
    name?: string | null;
}

/**
 * Prefixes that appear in interchange packages but differ from OpenMarch's
 * default section prefix (or need an explicit section when ambiguous).
 */
const DRILL_PREFIX_SECTION_ALIASES: Record<string, string> = {
    TS: SECTIONS.TenorSax.name,
    BS: SECTIONS.BassDrum.name,
    BD: SECTIONS.BassDrum.name,
    SN: SECTIONS.Snare.name,
    PR: SECTIONS.Prop.name,
};

const SECTION_BY_PREFIX = new Map(
    Object.values(SECTIONS).map((section) => [section.prefix, section.name]),
);

/** All prefixes used when splitting labels, longest first. */
export function getKnownDrillPrefixes(): string[] {
    return [
        ...new Set([
            ...Object.values(SECTIONS).map((section) => section.prefix),
            ...COMMON_DRILL_LABEL_PREFIXES,
            ...Object.keys(DRILL_PREFIX_SECTION_ALIASES),
        ]),
    ].sort((a, b) => b.length - a.length);
}

/** Maps a drill prefix to an OpenMarch section name. */
export function resolveSectionForDrillPrefix(prefix: string): string {
    const normalized = prefix.toUpperCase();
    const alias = DRILL_PREFIX_SECTION_ALIASES[normalized];
    if (alias) return alias;

    const section = SECTION_BY_PREFIX.get(normalized);
    if (section) return section;

    return SECTIONS.Other!.name;
}

/**
 * Parses a drill label and maps its prefix to an OpenMarch section, preserving
 * the source dot number (`drill_prefix` + `drill_order` === label).
 */
export function deriveMarcherFromDrillLabel(label: string): DerivedMarcher {
    const parsed = parseDrillLabel(label, getKnownDrillPrefixes());
    return {
        section: resolveSectionForDrillPrefix(parsed.drill_prefix),
        drill_prefix: parsed.drill_prefix,
        drill_order: parsed.drill_order,
    };
}
