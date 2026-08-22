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
        position: i + 1,
        include_in_measure: 1,
        notes: null,
    })),
];
const numberOfPages = 7;

const expectedPages = Array.from({ length: numberOfPages }, (_, i) => ({
    id: i,
    is_subset: 0,
    notes: null,
    start_beat: i === 0 ? 0 : (i - 1) * 8 + 1,
}));

// Export all arrays
export { expectedBeats, expectedPages };
