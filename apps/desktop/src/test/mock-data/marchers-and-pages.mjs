// Generate expected beats array (97 beats from 0 to 96)
const expectedBeats = [
    {
        id: 0,
        duration: 0,
        position: 0,
        include_in_measure: 1,
        notes: null,
    },
    ...Array.from({ length: 96 }, (_, i) => ({
        id: i + 1,
        duration: 0.5,
        position: i,
        include_in_measure: 1,
        notes: null,
    })),
];
const numberOfMarchers = 76;
const numberOfPages = 7;

const expectedMarchers = Array.from({ length: numberOfMarchers }, (_, i) => {
    let marcherNumber = i + 1;
    let drill_order = marcherNumber;
    let section, drill_prefix;

    if (marcherNumber <= 24) {
        section = "Trumpet";
        drill_prefix = "T";
    } else if (marcherNumber <= 40) {
        section = "Mellophone";
        drill_prefix = "M";
        drill_order = marcherNumber - 24;
    } else if (marcherNumber <= 64) {
        section = "Baritone";
        drill_prefix = "B";
        drill_order = marcherNumber - 40;
    } else {
        section = "Tuba";
        drill_prefix = "U";
        drill_order = marcherNumber - 64;
    }

    return {
        id: marcherNumber,
        name: null,
        section,
        drill_prefix,
        drill_order,
        year: null,
        notes: null,
    };
});

const expectedPages = Array.from({ length: numberOfPages }, (_, i) => ({
    id: i,
    is_subset: i % 2 === 0 ? 0 : 1,
    start_beat: Math.floor((expectedBeats.length * i) / numberOfPages),
    notes: null,
}));

// Generate expected marcher_pages array
const expectedMarcherPages = [];

// Generate expected marcher_pages array for all pages (0-6)
for (let pageId = 0; pageId < numberOfPages; pageId++) {
    for (let i = 1; i <= numberOfMarchers; i++) {
        expectedMarcherPages.push({
            id: pageId * 76 + i,
            marcher_id: i,
            page_id: pageId,
            x: null, // Ignoring coordinates as requested
            y: null, // Ignoring coordinates as requested
        });
    }
}

// Export all arrays
export { expectedBeats, expectedMarchers, expectedPages, expectedMarcherPages };
