const numberOfMarchers = 76;

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

// Export all arrays
export { expectedMarchers };
