// Generate expected beats array (97 beats from 0 to 96)
const expectedBeats = Array.from({ length: 97 }, (_, i) => ({
    id: i,
    duration: 0.5,
    beat_number: i,
    measure_id: 1,
    notes: null,
}));

const numberOfMarchers = 76;
const numberOfPages = 7;

const expectedMarchers = Array.from({ length: numberOfMarchers }, (_, i) => {
    const marcherNumber = i + 1;
    let instrument, abbreviation;

    if (marcherNumber <= 24) {
        instrument = "Trumpet";
        abbreviation = "T";
    } else if (marcherNumber <= 40) {
        instrument = "Mellophone";
        abbreviation = "M";
    } else if (marcherNumber <= 64) {
        instrument = "Baritone";
        abbreviation = "B";
    } else {
        instrument = "Tuba";
        abbreviation = "U";
    }

    return {
        id: marcherNumber,
        name: null,
        instrument,
        section: null,
        abbreviation,
        number: marcherNumber,
    };
});

const expectedPages = Array.from({ length: numberOfPages }, (_, i) => ({
    id: i,
    page_number: 0,
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
