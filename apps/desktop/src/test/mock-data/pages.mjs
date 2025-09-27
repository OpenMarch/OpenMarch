// Generate expected beats array (97 beats from 0 to 96)
const expectedBeats = Array.from({ length: 97 }, (_, i) => ({
    id: i,
    duration: 0.5,
    beat_number: i,
    measure_id: 1,
    position: i,
    notes: null,
    include_in_measure: 1,
}));

const numberOfPages = 7;

const expectedPages = Array.from({ length: numberOfPages }, (_, i) => ({
    id: i,
    is_subset: i % 2 === 0 ? 0 : 1,
    page_number: 0,
    notes: null,
    start_beat: Math.floor((expectedBeats.length * i) / numberOfPages),
}));

// Export all arrays
export { expectedBeats, expectedPages };
