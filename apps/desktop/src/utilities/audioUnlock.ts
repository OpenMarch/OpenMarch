/**
 * Lets audio play on iPads and phones. Safari (and Chrome on Android) keep
 * an AudioContext suspended until it is resumed during a tap or key press,
 * but playback starts from an effect after the Play press, outside it. So
 * every press resumes the app's AudioContext if it isn't running, and the
 * first one also plays a moment of silence, which unlocks audio for the
 * page on older iOS. A context iOS interrupts later (a call, the app in the
 * background) is resumed by the next press the same way.
 *
 * Desktop browsers and Electron already run the context; resuming a running
 * one does nothing.
 */

/**
 * Events that count as the person's activation, so audio may start in them.
 * `pointerdown` from a finger doesn't count (the spec's activation events
 * are a finger's `pointerup` and `touchend`, a mouse's `pointerdown`).
 */
export const UNLOCK_EVENTS = [
    "pointerdown",
    "pointerup",
    "touchend",
    "mousedown",
    "keydown",
] as const;

/** Whether `context` needs resuming ("suspended", or iOS's "interrupted"). */
export function needsResume(context: Pick<BaseAudioContext, "state">) {
    return context.state !== "running" && context.state !== "closed";
}

/** Plays one silent sample on `context`, which unlocks audio on older iOS. */
function playSilence(context: AudioContext) {
    try {
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, context.sampleRate);
        source.connect(context.destination);
        source.start(0);
    } catch {
        // Nothing to unlock with; resume() still did what it could.
    }
}

/**
 * iOS plays Web Audio through the ringer, so the silent switch mutes it;
 * "playback" plays it like music (Safari 16.4+).
 */
function preferPlaybackSession() {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try {
        if (nav.audioSession) nav.audioSession.type = "playback";
    } catch {
        // Not supported here.
    }
}

/**
 * Starts resuming the contexts `getContexts` returns on each press; returns
 * the stop. `getContexts` is read at each press, since the app creates its
 * context later than this starts (when a show opens).
 */
export function startAudioUnlock(
    getContexts: () => (AudioContext | null | undefined)[],
    target: Pick<Window, "addEventListener" | "removeEventListener"> = window,
): () => void {
    preferPlaybackSession();
    const silenced = new WeakSet<AudioContext>();
    const onPress = () => {
        for (const context of getContexts()) {
            if (!context || !needsResume(context)) continue;
            void context.resume().catch(() => {
                // Not allowed from this event; a later one will be.
            });
            if (!silenced.has(context)) {
                silenced.add(context);
                playSilence(context);
            }
        }
    };
    for (const type of UNLOCK_EVENTS)
        target.addEventListener(type, onPress, { capture: true });
    return () => {
        for (const type of UNLOCK_EVENTS)
            target.removeEventListener(type, onPress, { capture: true });
    };
}
