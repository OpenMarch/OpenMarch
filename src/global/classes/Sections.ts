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

    constructor({ name, family, prefix }:
        { name: string; family: SectionFamily; prefix: string; }) {
        this.name = name;
        this.family = family;
        this.scoreOrder = Section.currentScoreOrder++;
        this.prefix = prefix;
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
        else
            // If the families are the same, return the Section's score order comparison
            return this.scoreOrder - otherSection.scoreOrder;
    }
}

class SectionFamily {
    private static currentScoreOrder = 0;
    readonly name: string;
    readonly scoreOrder: number;
    constructor(name: string) {
        this.name = name;
        this.scoreOrder = SectionFamily.currentScoreOrder++;
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
const FAMILIES: { [key: string]: SectionFamily } = {
    Woodwind: new SectionFamily("Woodwind"),
    Brass: new SectionFamily("Brass"),
    Battery: new SectionFamily("Battery"),
    Guard: new SectionFamily("Guard"),
    Other: new SectionFamily("Other"),
    Pit: new SectionFamily("Pit"),
}

/**
 * A list of all sections defined in OpenMarch. The score order of these sections is the order they are
 * defined in this object.
 *
 * The order of sections is the family order (defined in the SectionFamily enum), then the score order.
 */
export const SECTIONS: { [key: string]: Section } = {
    Piccolo: new Section({ family: FAMILIES.Woodwind, name: "Piccolo", prefix: "P" }),
    Flute: new Section({ family: FAMILIES.Woodwind, name: "Flute", prefix: "F" }),
    Clarinet: new Section({ family: FAMILIES.Woodwind, name: "Clarinet", prefix: "C" }),
    BassClarinet: new Section({ family: FAMILIES.Woodwind, name: "Bass Clarinet", prefix: "BC" }),
    SopranoSax: new Section({ family: FAMILIES.Woodwind, name: "Soprano Sax", prefix: "SS" }),
    AltoSax: new Section({ family: FAMILIES.Woodwind, name: "Alto Sax", prefix: "A" }),
    TenorSax: new Section({ family: FAMILIES.Woodwind, name: "Tenor Sax", prefix: "N" }),
    BariSax: new Section({ family: FAMILIES.Woodwind, name: "Bari Sax", prefix: "I" }),
    Trumpet: new Section({ family: FAMILIES.Brass, name: "Trumpet", prefix: "T" }),
    Mellophone: new Section({ family: FAMILIES.Brass, name: "Mellophone", prefix: "M" }),
    Trombone: new Section({ family: FAMILIES.Brass, name: "Trombone", prefix: "O" }),
    BassTrombone: new Section({ family: FAMILIES.Brass, name: "Bass Trombone", prefix: "BO" }),
    Baritone: new Section({ family: FAMILIES.Brass, name: "Baritone", prefix: "B" }),
    Euphonium: new Section({ family: FAMILIES.Brass, name: "Euphonium", prefix: "E" }),
    Tuba: new Section({ family: FAMILIES.Brass, name: "Tuba", prefix: "U" }),
    Snare: new Section({ family: FAMILIES.Battery, name: "Snare", prefix: "S" }),
    Tenors: new Section({ family: FAMILIES.Battery, name: "Tenors", prefix: "Q" }),
    BassDrum: new Section({ family: FAMILIES.Battery, name: "Bass Drum", prefix: "D" }),
    Cymbals: new Section({ family: FAMILIES.Battery, name: "Cymbals", prefix: "C" }),
    FlubDrum: new Section({ family: FAMILIES.Battery, name: "Flub Drum", prefix: "L" }),
    ColorGuard: new Section({ family: FAMILIES.Guard, name: "Color Guard", prefix: "G" }),
    Rifle: new Section({ family: FAMILIES.Guard, name: "Rifle", prefix: "R" }),
    Flag: new Section({ family: FAMILIES.Guard, name: "Flag", prefix: "FL" }),
    Dancer: new Section({ family: FAMILIES.Guard, name: "Dancer", prefix: "DN" }),
    Twirler: new Section({ family: FAMILIES.Guard, name: "Twirler", prefix: "TW" }),
    Soloist: new Section({ family: FAMILIES.Other, name: "Soloist", prefix: "SL" }),
    Marimba: new Section({ family: FAMILIES.Pit, name: "Marimba", prefix: "MR" }),
    Vibraphone: new Section({ family: FAMILIES.Pit, name: "Vibraphone", prefix: "VB" }),
    Xylophone: new Section({ family: FAMILIES.Pit, name: "Xylophone", prefix: "X" }),
    AuxPercussion: new Section({ family: FAMILIES.Pit, name: "Aux Percussion", prefix: "AX" }),
    Synthesizer: new Section({ family: FAMILIES.Pit, name: "Synthesizer", prefix: "SY" }),
    DrumMajor: new Section({ family: FAMILIES.Other, name: "Drum Major", prefix: "DM" }),
    Other: new Section({ family: FAMILIES.Other, name: "Other", prefix: "OT" }),
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
        Object.values(SECTIONS).find(section => section.name === name)
        || SECTIONS.Other;
    return section;
}
