/**
 * The one rule for an Artwork slot id (props-spec section 4), used by the
 * model import: 1 to 64
 * letters, digits, underscores or dashes. The Blender add-on's default
 * (`slot_name()` in `starter-kit/addons/openmarch_tools/core.py`) is lowercase
 * letters, digits and dashes, such as `front-panel`.
 */
export const ARTWORK_SLOT_ID_MAX_LENGTH = 64;

/** The characters a slot id may have, as a regular expression class body. */
const SLOT_ID_CHARACTERS = "A-Za-z0-9_-";

export const ARTWORK_SLOT_ID = new RegExp(
    `^[${SLOT_ID_CHARACTERS}]{1,${ARTWORK_SLOT_ID_MAX_LENGTH}}$`,
);

/** Whether `id` is a valid Artwork slot id. */
export const isArtworkSlotId = (id: unknown): id is string =>
    typeof id === "string" && ARTWORK_SLOT_ID.test(id);

/** How the rule reads in an error or an import note. */
export const ARTWORK_SLOT_ID_RULE = `1 to ${ARTWORK_SLOT_ID_MAX_LENGTH} letters, digits, underscores or dashes`;
