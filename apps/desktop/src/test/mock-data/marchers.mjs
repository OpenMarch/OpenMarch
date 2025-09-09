const numberOfMarchers = 76;

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

// Export all arrays
export { expectedMarchers };
