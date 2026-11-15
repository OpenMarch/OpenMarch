import { db } from "@/global/database/db";
import {
    readFieldSnapshot,
    restoreFieldSnapshot,
    type FieldSnapshot,
} from "@/db-functions/fieldEdits";

/**
 * The field as it was when the Edit field panel opened (#824), so the panel's X can put it back.
 * Done keeps the changes and forgets this; X writes it back as one undo step, so undo brings the
 * discarded changes back.
 */
let started: Promise<FieldSnapshot | null> | null = null;

/** Remembers the field as it is now. Called as the panel opens. */
export function beginFieldEditSession() {
    started = readFieldSnapshot(db).catch((error) => {
        console.error("Couldn't remember the field to cancel to", error);
        return null;
    });
}

/** Forgets the remembered field (Done, or the mode ending another way) */
export function endFieldEditSession() {
    started = null;
}

/** Field edits still being written */
const inFlight = new Set<Promise<unknown>>();

/**
 * Notes a field edit being written until it settles, so X waits for it: clicking X blurs a text
 * field first, and the save that starts must not land after the field is put back
 */
export function trackFieldEdit<T>(write: Promise<T>): Promise<T> {
    inFlight.add(write);
    const done = () => inFlight.delete(write);
    write.then(done, done);
    return write;
}

/**
 * Puts the field back as it was when the panel opened, and forgets it, once the edits still being
 * written have landed. Resolves with whether anything changed.
 */
export async function discardFieldEditSession(): Promise<boolean> {
    const pending = started;
    started = null;
    await Promise.allSettled([...inFlight]);
    const snapshot = pending ? await pending : null;
    if (!snapshot) return false;
    return await restoreFieldSnapshot({ db, snapshot });
}
