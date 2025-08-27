// Generate expected beats array (97 beats from 0 to 96)
const expectedBeats = Array.from({ length: 97 }, (_, i) => ({
    id: i,
    duration: 0.5,
    beat_number: i,
    measure_id: 1,
    notes: null,
}));

// Generate expected marchers array (76 marchers from 1 to 76)
const expectedMarchers = Array.from({ length: 76 }, (_, i) => {
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

// Generate expected pages array (7 pages from 0 to 6)
const expectedPages = Array.from({ length: 7 }, (_, i) => ({
    id: i,
    page_number: 0,
    notes: null,
}));

// Generate expected marcher_pages array
const expectedMarcherPages = [];

// Page 0: All marchers in their initial positions
for (let i = 1; i <= 76; i++) {
    expectedMarcherPages.push({
        id: i,
        marcher_id: i,
        page_id: 0,
        x: null, // Ignoring coordinates as requested
        y: null, // Ignoring coordinates as requested
    });
}

// Page 1: All marchers in new positions
for (let i = 1; i <= 76; i++) {
    expectedMarcherPages.push({
        id: 76 + i,
        marcher_id: i,
        page_id: 1,
        x: null, // Ignoring coordinates as requested
        y: null, // Ignoring coordinates as requested
    });
}

// Page 2: All marchers in new positions
for (let i = 1; i <= 76; i++) {
    expectedMarcherPages.push({
        id: 152 + i,
        marcher_id: i,
        page_id: 2,
        x: null, // Ignoring coordinates as requested
        y: null, // Ignoring coordinates as requested
    });
}

// Page 3: All marchers in new positions
for (let i = 1; i <= 76; i++) {
    expectedMarcherPages.push({
        id: 228 + i,
        marcher_id: i,
        page_id: 3,
        x: null, // Ignoring coordinates as requested
        y: null, // Ignoring coordinates as requested
    });
}

// Page 4: All marchers in new positions
for (let i = 1; i <= 76; i++) {
    expectedMarcherPages.push({
        id: 304 + i,
        marcher_id: i,
        page_id: 4,
        x: null, // Ignoring coordinates as requested
        y: null, // Ignoring coordinates as requested
    });
}

// Page 5: All marchers in new positions
for (let i = 1; i <= 76; i++) {
    expectedMarcherPages.push({
        id: 380 + i,
        marcher_id: i,
        page_id: 5,
        x: null, // Ignoring coordinates as requested
        y: null, // Ignoring coordinates as requested
    });
}

// Page 6: All marchers in their final positions (same as page 0)
for (let i = 1; i <= 76; i++) {
    expectedMarcherPages.push({
        id: 456 + i,
        marcher_id: i,
        page_id: 6,
        x: null, // Ignoring coordinates as requested
        y: null, // Ignoring coordinates as requested
    });
}

// Export all arrays
export { expectedBeats, expectedMarchers, expectedPages, expectedMarcherPages };
