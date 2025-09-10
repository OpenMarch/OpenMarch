const expectedBeats = Array.from({ length: 97 }, (_, i) => ({
    id: i,
    duration: 0.5,
    beat_number: i,
    measure_id: 1,
    position: i,
    include_in_measure: 1,
    notes: null,
}));

export { expectedBeats };
