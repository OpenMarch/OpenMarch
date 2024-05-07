/**
 * A beat unit is a fraction of a whole note that represents the duration of a note.
 * This is used for things like tempo and pulse.
 */
enum BeatUnit {
    WHOLE = 1,
    HALF = 1 / 2,
    DOTTED_HALF = 3 / 4,
    QUARTER = 1 / 4,
    DOTTED_QUARTER = 3 / 8,
    EIGHTH = 1 / 8,
    DOTTED_EIGHTH = 3 / 16,
    SIXTEENTH = 1 / 16,
    DOTTED_SIXTEENTH = 3 / 32,
    THIRTY_SECOND = 1 / 32,
    SIXTY_FOURTH = 1 / 64
}

export default BeatUnit;
