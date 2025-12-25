class Section {
    private static currentScoreOrder = 0;
    /** The name of the section. E.g. "Baritone" */
    readonly name: string;
    /** The family of the section. E.g. "Brass" */
    readonly family: SectionFamily;
    /** The order of the section in the score. E.g. 1 for Piccolo */
    readonly scoreOrder: number;
    /** The prefix of the drill number for this section E.g. "B" for Baritone */
    readonly prefix: string;
    /** The translation key for the section name */
    readonly tName: string;

    constructor({
        name,
        family,
        prefix,
        tName,
    }: {
        name: string;
        family: SectionFamily;
        prefix: string;
        tName: string;
    }) {
        this.name = name;
        this.family = family;
        this.scoreOrder = Section.currentScoreOrder++;
        this.prefix = prefix;
        this.tName = tName;
    }

    /**
     * Returns a string representation of the section.
     * @returns The name of the section.
     */
    toString(): string {
        return this.name;
    }

    /**
     * Compares this section to another section based on their scoreOrder. Used for sorting.
     * @param otherSection
     * @returns the difference between the scoreOrder of this section and the other section.
     */
    compareTo(otherSection: Section): number {
        const familyComparison = this.family.compareTo(otherSection.family);
        if (familyComparison !== 0)
            // If the families are different, return the family comparison, ignoring the Section's score order
            return familyComparison;
        // If the families are the same, return the Section's score order comparison
        else return this.scoreOrder - otherSection.scoreOrder;
    }
}

export class SectionFamily {
    private static currentScoreOrder = 0;
    readonly name: string;
    readonly tName: string;
    readonly scoreOrder: number;
    constructor(name: string, tName: string) {
        this.name = name;
        this.scoreOrder = SectionFamily.currentScoreOrder++;
        this.tName = tName;
    }

    /**
     * String representation of the family.
     * @returns The name of the family.
     */
    toString(): string {
        return this.name;
    }

    /**
     * This function compares this family to another family based on their scoreOrder.
     *
     * @param otherFamily The other family to compare to.
     * @returns The difference between the scoreOrder of this family and the other family.
     */
    compareTo(otherFamily: SectionFamily): number {
        return this.scoreOrder - otherFamily.scoreOrder;
    }
}

/**
 * Families of the section. E.g. "Woodwind"
 *
 * The order of families is the order they are defined in this object.
 * This is used for sorting sections in the UI. Family order supersedes score order.
 */
export const FAMILIES: { [key: string]: SectionFamily } = {
    Woodwind: new SectionFamily("Woodwind", "section.family.woodwind"),
    Brass: new SectionFamily("Brass", "section.family.brass"),
    Battery: new SectionFamily("Battery", "section.family.battery"),
    Guard: new SectionFamily("Guard", "section.family.guard"),
    Other: new SectionFamily("Other", "section.family.other"),
    Pit: new SectionFamily("Pit", "section.family.pit"),
};

/**
 * A list of all sections defined in OpenMarch. The score order of these sections is the order they are
 * defined in this object.
 *
 * The order of sections is the family order (defined in the SectionFamily enum), then the score order.
 */
export const SECTIONS: { [key: string]: Section } = {
    Piccolo: new Section({
        family: FAMILIES.Woodwind,
        name: "Piccolo",
        tName: "section.instrument.piccolo",
        prefix: "P",
    }),
    Flute: new Section({
        family: FAMILIES.Woodwind,
        name: "Flute",
        tName: "section.instrument.flute",
        prefix: "F",
    }),
    Clarinet: new Section({
        family: FAMILIES.Woodwind,
        name: "Clarinet",
        tName: "section.instrument.clarinet",
        prefix: "C",
    }),
    BassClarinet: new Section({
        family: FAMILIES.Woodwind,
        name: "Bass Clarinet",
        tName: "section.instrument.bassClarinet",
        prefix: "BC",
    }),
    SopranoSax: new Section({
        family: FAMILIES.Woodwind,
        name: "Soprano Sax",
        tName: "section.instrument.sopranoSax",
        prefix: "SS",
    }),
    AltoSax: new Section({
        family: FAMILIES.Woodwind,
        name: "Alto Sax",
        tName: "section.instrument.altoSax",
        prefix: "A",
    }),
    TenorSax: new Section({
        family: FAMILIES.Woodwind,
        name: "Tenor Sax",
        tName: "section.instrument.tenorSax",
        prefix: "N",
    }),
    BariSax: new Section({
        family: FAMILIES.Woodwind,
        name: "Bari Sax",
        tName: "section.instrument.bariSax",
        prefix: "I",
    }),
    Trumpet: new Section({
        family: FAMILIES.Brass,
        name: "Trumpet",
        tName: "section.instrument.trumpet",
        prefix: "T",
    }),
    Mellophone: new Section({
        family: FAMILIES.Brass,
        name: "Mellophone",
        tName: "section.instrument.mellophone",
        prefix: "M",
    }),
    Trombone: new Section({
        family: FAMILIES.Brass,
        name: "Trombone",
        tName: "section.instrument.trombone",
        prefix: "O",
    }),
    BassTrombone: new Section({
        family: FAMILIES.Brass,
        name: "Bass Trombone",
        tName: "section.instrument.bassTrombone",
        prefix: "BO",
    }),
    Baritone: new Section({
        family: FAMILIES.Brass,
        name: "Baritone",
        tName: "section.instrument.baritone",
        prefix: "B",
    }),
    Euphonium: new Section({
        family: FAMILIES.Brass,
        name: "Euphonium",
        tName: "section.instrument.euphonium",
        prefix: "E",
    }),
    Tuba: new Section({
        family: FAMILIES.Brass,
        name: "Tuba",
        tName: "section.instrument.tuba",
        prefix: "U",
    }),
    Snare: new Section({
        family: FAMILIES.Battery,
        name: "Snare",
        tName: "section.instrument.snare",
        prefix: "S",
    }),
    Tenors: new Section({
        family: FAMILIES.Battery,
        name: "Tenors",
        tName: "section.instrument.tenors",
        prefix: "Q",
    }),
    BassDrum: new Section({
        family: FAMILIES.Battery,
        name: "Bass Drum",
        tName: "section.instrument.bassDrum",
        prefix: "D",
    }),
    Cymbals: new Section({
        family: FAMILIES.Battery,
        name: "Cymbals",
        tName: "section.instrument.cymbals",
        prefix: "C",
    }),
    FlubDrum: new Section({
        family: FAMILIES.Battery,
        name: "Flub Drum",
        tName: "section.instrument.flubDrum",
        prefix: "L",
    }),
    ColorGuard: new Section({
        family: FAMILIES.Guard,
        name: "Color Guard",
        tName: "section.guard.colorGuard",
        prefix: "G",
    }),
    Rifle: new Section({
        family: FAMILIES.Guard,
        name: "Rifle",
        tName: "section.guard.rifle",
        prefix: "R",
    }),
    Flag: new Section({
        family: FAMILIES.Guard,
        name: "Flag",
        tName: "section.guard.flag",
        prefix: "FL",
    }),
    Dancer: new Section({
        family: FAMILIES.Guard,
        name: "Dancer",
        tName: "section.guard.dancer",
        prefix: "DN",
    }),
    Twirler: new Section({
        family: FAMILIES.Guard,
        name: "Twirler",
        tName: "section.guard.twirler",
        prefix: "TW",
    }),
    Soloist: new Section({
        family: FAMILIES.Other,
        name: "Soloist",
        tName: "section.soloist.soloist",
        prefix: "SL",
    }),
    Marimba: new Section({
        family: FAMILIES.Pit,
        name: "Marimba",
        tName: "section.pit.marimba",
        prefix: "MR",
    }),
    Vibraphone: new Section({
        family: FAMILIES.Pit,
        name: "Vibraphone",
        tName: "section.pit.vibraphone",
        prefix: "VB",
    }),
    Xylophone: new Section({
        family: FAMILIES.Pit,
        name: "Xylophone",
        tName: "section.pit.xylophone",
        prefix: "X",
    }),
    AuxPercussion: new Section({
        family: FAMILIES.Pit,
        name: "Aux Percussion",
        tName: "section.pit.auxPercussion",
        prefix: "AX",
    }),
    Synthesizer: new Section({
        family: FAMILIES.Pit,
        name: "Synthesizer",
        tName: "section.pit.synthesizer",
        prefix: "SY",
    }),
    DrumMajor: new Section({
        family: FAMILIES.Other,
        name: "Drum Major",
        tName: "section.drumMajor",
        prefix: "DM",
    }),
    Other: new Section({
        family: FAMILIES.Other,
        name: "Other",
        tName: "section.other",
        prefix: "OT",
    }),
} as const;

/**
 * Use this function to get a section object by its name.
 *
 * Since Marchers store the section as a string, this function is used for converting said string to a Section object,
 * to use for sorting and other operations.
 *
 * If an invalid name is passed, the section will be marked as "Other".
 *
 * @param name The name of the section to get. E.g. "Bass Drum"
 * @returns
 */
export function getSectionObjectByName(name: string): Section {
    const section =
        Object.values(SECTIONS).find((section) => section.name === name) ||
        SECTIONS.Other;
    return section;
}

/**
 * Use this function to get the translated name of a section.
 *
 * @param name The name of the section to get. E.g. "Bass Drum"
 * @param t The translation function to use.
 * @returns The translated name of the section.
 */
export function getTranslatedSectionName(
    name: string,
    t: (key: string) => string,
): string {
    const section = getSectionObjectByName(name);
    return t(section.tName);
}
