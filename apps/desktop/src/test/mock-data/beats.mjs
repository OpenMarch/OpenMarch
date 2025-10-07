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

export { expectedBeats };
