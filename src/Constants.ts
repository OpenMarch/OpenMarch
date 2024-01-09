export const Constants = {
    PageTableName: "pages",
    MarcherTableName: "marchers",
    MarcherPageTableName: "marcher_pages",
    HistoryTableName: "history",


    PagePrefix: "page",
    NewPageId: "NEW_PAGE",
    MarcherPrefix: "marcher",
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
    Piccolo: { family: "Woodwind", name: "Piccolo", scoreOrder: 1, prefix: "P" },
    Flute: { family: "Woodwind", name: "Flute", scoreOrder: 2, prefix: "F" },
    Clarinet: { family: "Woodwind", name: "Clarinet", scoreOrder: 3, prefix: "C" },
    BassClarinet: { family: "Woodwind", name: "Bass Clarinet", scoreOrder: 4, prefix: "BC" },
    SopranoSax: { family: "Woodwind", name: "Soprano Sax", scoreOrder: 5, prefix: "SS" },
    AltoSax: { family: "Woodwind", name: "Alto Sax", scoreOrder: 6, prefix: "A" },
    TenorSax: { family: "Woodwind", name: "Tenor Sax", scoreOrder: 7, prefix: "N" },
    BariSax: { family: "Woodwind", name: "Bari Sax", scoreOrder: 8, prefix: "I" },
    Trumpet: { family: "Brass", name: "Trumpet", scoreOrder: 9, prefix: "T" },
    Mellophone: { family: "Brass", name: "Mellophone", scoreOrder: 10, prefix: "M" },
    Trombone: { family: "Brass", name: "Trombone", scoreOrder: 11, prefix: "O" },
    BassTrombone: { family: "Brass", name: "Bass Trombone", scoreOrder: 12, prefix: "BO" },
    Baritone: { family: "Brass", name: "Baritone", scoreOrder: 13, prefix: "B" },
    Euphonium: { family: "Brass", name: "Euphonium", scoreOrder: 14, prefix: "E" },
    Tuba: { family: "Brass", name: "Tuba", scoreOrder: 15, prefix: "U" },
    Snare: { family: "Battery", name: "Snare", scoreOrder: 16, prefix: "S" },
    Tenors: { family: "Battery", name: "Tenors", scoreOrder: 17, prefix: "Q" },
    BassDrum: { family: "Battery", name: "Bass Drum", scoreOrder: 18, prefix: "D" },
    Cymbals: { family: "Battery", name: "Cymbals", scoreOrder: 19, prefix: "C" },
    FlubDrum: { family: "Battery", name: "Flub Drum", scoreOrder: 20, prefix: "L" },
    ColorGuard: { family: "Guard", name: "Color Guard", scoreOrder: 21, prefix: "G" },
    Rifle: { family: "Guard", name: "Rifle", scoreOrder: 22, prefix: "R" },
    Flag: { family: "Guard", name: "Flag", scoreOrder: 23, prefix: "FL" },
    Dancer: { family: "Guard", name: "Dancer", scoreOrder: 24, prefix: "DN" },
    Twirler: { family: "Guard", name: "Twirler", scoreOrder: 25, prefix: "TW" },
    Soloist: { family: "Other", name: "Soloist", scoreOrder: 26, prefix: "SL" },
    Marimba: { family: "Pit", name: "Marimba", scoreOrder: 27, prefix: "MR" },
    Vibraphone: { family: "Pit", name: "Vibraphone", scoreOrder: 28, prefix: "VB" },
    Xylophone: { family: "Pit", name: "Xylophone", scoreOrder: 29, prefix: "X" },
    AuxPercussion: { family: "Pit", name: "Aux Percussion", scoreOrder: 30, prefix: "AX" },
    Synthesizer: { family: "Pit", name: "Synthesizer", scoreOrder: 31, prefix: "SY" },
    DrumMajor: { family: "Other", name: "Drum Major", scoreOrder: 32, prefix: "DM" },
    Other: { family: "Other", name: "Other", scoreOrder: 33, prefix: "OT" }
} as const;
