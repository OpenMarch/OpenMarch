export const Constants = {
    PageTableName: "pages",
    PagePrefix: "page",
    NewPageId: "NEW_PAGE",

    MarcherTableName: "marchers",
    MarcherPrefix: "marcher",

    MarcherPageTableName: "marcher_pages",
    MarcherPagePrefix: "mp",

    dotRadius: 5
} as const;

/**
 * Assumes that the id_for_html is in the form "page_1" with a single "_" delimiter
 * @param id_for_html "page_1"
 * @returns an integer id "1"
 */
export const idForHtmlToId = (id_for_html: string) => {
    return parseInt(id_for_html.split("_")[1]);
}

export const YARD_LINES = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0] as const;
export const HASHES = ["front sideline", "front hash", "back hash", "back sideline"] as const;

export const sections = {
    Piccolo: { family: "Woodwind", instrument: "Piccolo", scoreOrder: 1, prefix: "P" },
    Flute: { family: "Woodwind", instrument: "Flute", scoreOrder: 2, prefix: "F" },
    Clarinet: { family: "Woodwind", instrument: "Clarinet", scoreOrder: 3, prefix: "C" },
    BassClarinet: { family: "Woodwind", instrument: "Bass Clarinet", scoreOrder: 4, prefix: "BC" },
    SopranoSax: { family: "Woodwind", instrument: "Soprano Sax", scoreOrder: 5, prefix: "SS" },
    AltoSax: { family: "Woodwind", instrument: "Alto Sax", scoreOrder: 6, prefix: "A" },
    TenorSax: { family: "Woodwind", instrument: "Tenor Sax", scoreOrder: 7, prefix: "N" },
    BariSax: { family: "Woodwind", instrument: "Bari Sax", scoreOrder: 8, prefix: "I" },
    Trumpet: { family: "Brass", instrument: "Trumpet", scoreOrder: 9, prefix: "T" },
    Mellophone: { family: "Brass", instrument: "Mellophone", scoreOrder: 10, prefix: "M" },
    Trombone: { family: "Brass", instrument: "Trombone", scoreOrder: 11, prefix: "O" },
    BassTrombone: { family: "Brass", instrument: "Bass Trombone", scoreOrder: 12, prefix: "BO" },
    Baritone: { family: "Brass", instrument: "Baritone", scoreOrder: 13, prefix: "B" },
    Euphonium: { family: "Brass", instrument: "Euphonium", scoreOrder: 14, prefix: "E" },
    Tuba: { family: "Brass", instrument: "Tuba", scoreOrder: 15, prefix: "U" },
    Snare: { family: "Battery", instrument: "Snare", scoreOrder: 16, prefix: "S" },
    Tenors: { family: "Battery", instrument: "Tenors", scoreOrder: 17, prefix: "Q" },
    BassDrum: { family: "Battery", instrument: "Bass Drum", scoreOrder: 18, prefix: "D" },
    Cymbals: { family: "Battery", instrument: "Cymbals", scoreOrder: 19, prefix: "C" },
    FlubDrum: { family: "Battery", instrument: "Flub Drum", scoreOrder: 20, prefix: "L" },
    ColorGuard: { family: "Guard", instrument: "Color Guard", scoreOrder: 21, prefix: "G" },
    Rifle: { family: "Guard", instrument: "Rifle", scoreOrder: 22, prefix: "R" },
    Flag: { family: "Guard", instrument: "Flag", scoreOrder: 23, prefix: "FL" },
    Dancer: { family: "Guard", instrument: "Dancer", scoreOrder: 24, prefix: "DN" },
    Twirler: { family: "Guard", instrument: "Twirler", scoreOrder: 25, prefix: "TW" },
    Soloist: { family: "Other", instrument: "Soloist", scoreOrder: 26, prefix: "SL" },
    Marimba: { family: "Pit", instrument: "Marimba", scoreOrder: 27, prefix: "MR" },
    Vibraphone: { family: "Pit", instrument: "Vibraphone", scoreOrder: 28, prefix: "VB" },
    Xylophone: { family: "Pit", instrument: "Xylophone", scoreOrder: 29, prefix: "X" },
    AuxPercussion: { family: "Pit", instrument: "Aux Percussion", scoreOrder: 30, prefix: "AX" },
    Synthesizer: { family: "Pit", instrument: "Synthesizer", scoreOrder: 31, prefix: "SY" },
    DrumMajor: { family: "Other", instrument: "Drum Major", scoreOrder: 32, prefix: "DM" },
    Other: { family: "Other", instrument: "Other", scoreOrder: 33, prefix: "OT" }
} as const;

/* Marcher List Form */
export const marcherListFormAttributes = {
    formId: "marcherListForm",

} as const;
