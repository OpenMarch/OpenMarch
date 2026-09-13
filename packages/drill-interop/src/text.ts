import { BinaryReader } from "./binaryReader";

/**
 * A block of text the designer placed on the field, next to the formation it
 * describes ("HOLD", "All face FRONT", "Winds flutter sequentially by line…").
 */
export interface DrillFieldText {
    /** Stable source id for the text object. */
    id: string;
    /** The count whose formation the text annotates. */
    count: number;
    text: string;
}

/** Object type tags inside a `PRP8` chunk. */
const TEXT_OBJECT = 2;
const PROP_OBJECT = 1;

/** `u64 id` + four `f32` bounds, shared by both object types. */
const OBJECT_HEADER_BYTES = 8 + 16;
/** Trailing fixed-width payload of a prop/marker object. */
const PROP_TAIL_BYTES = 14;
/** Flag bytes between a text object's bounds and its length-prefixed string. */
const TEXT_FLAG_BYTES = 4;

/**
 * `PRP8`: `u16 count`, then that many objects, each led by a type byte —
 * `2` = a text box (`u64 id, 4×f32 bounds, 4 flags, u16 len, text`), `1` = a
 * prop/marker record of fixed width, which we skip.
 *
 * The chunks are interleaved with the page frames rather than carrying a count
 * of their own: a `PRP8` appears in the stream directly after the frame it
 * belongs to, so the caller passes how many frames it has already read. That
 * lands each text on the formation it was placed beside — which is how the
 * holds in Jack Britt line up with its subset pages, `"Subset for tubas."`
 * included.
 *
 * Returns an empty list for a chunk of props with no text, and stops early
 * rather than misreading if an unknown object type appears.
 */
export function readFieldText(
    payload: Uint8Array,
    count: number,
): DrillFieldText[] {
    const reader = new BinaryReader(payload);
    if (reader.remaining < 2) return [];
    const objectCount = reader.u16();
    const texts: DrillFieldText[] = [];

    for (let i = 0; i < objectCount; i++) {
        if (reader.remaining < 1) break;
        const type = reader.slice(1)[0]!;

        if (type === TEXT_OBJECT) {
            if (reader.remaining < OBJECT_HEADER_BYTES + TEXT_FLAG_BYTES + 2) {
                break;
            }
            const id = reader.u64String();
            reader.skip(16); // bounding box
            reader.skip(TEXT_FLAG_BYTES);
            const length = reader.u16();
            if (length > reader.remaining) break;
            const text = reader.utf8(length).trim();
            if (text.length > 0) texts.push({ id, count, text });
            continue;
        }

        if (type === PROP_OBJECT) {
            if (reader.remaining < OBJECT_HEADER_BYTES + PROP_TAIL_BYTES) break;
            reader.skip(OBJECT_HEADER_BYTES + PROP_TAIL_BYTES);
            continue;
        }

        break;
    }

    return texts;
}
