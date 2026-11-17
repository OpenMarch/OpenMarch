/**
 * The touch transport's Play menu (tablet 3.5, #888; plan decision 6): a long press on Play lists
 * what Play does with each modifier on desktop, each as the action that modifier's key runs, so
 * a tablet reaches Play on, Play from here and Pause without Alt or Shift. The rows follow the
 * desktop tooltip's guide (`TransportPlayButton`): the same choices, in the same order.
 */

/** Which modifier's Play a row stands for, as the transport's guide names them */
export type TouchPlayMode = "play" | "alt" | "shift";

export interface TouchPlayVariant {
    readonly mode: TouchPlayMode;
    /** The action the row runs: Space's, Alt+Space's or Shift+Space's */
    readonly action: "playPause" | "playOn" | "playPage";
}

/**
 * The menu's rows, or none when a long press has nothing more than a tap to offer.
 *
 * - Stopped: Play (Space), Play on from the start flag (Alt+Space, Expert only), and Play from the
 *   playhead or the loop once (Shift+Space).
 * - Playing: Stop and go back (Space), and Pause here (Shift+Space, UI-24).
 * - Tempo mode (`playOnly`): Play is the only play action, so no menu.
 */
export function touchPlayVariants({
    isPlaying,
    playsOn,
    fromPlayhead,
    playOnly,
}: {
    readonly isPlaying: boolean;
    /** The transport offers Alt's Play on (Expert, UI-26) */
    readonly playsOn: boolean;
    /** The transport offers Shift's Play from the playhead, or Pause while playing */
    readonly fromPlayhead: boolean;
    /** Tempo mode's one Play */
    readonly playOnly: boolean;
}): readonly TouchPlayVariant[] {
    if (playOnly) return [];
    const rows: TouchPlayVariant[] = [{ mode: "play", action: "playPause" }];
    if (playsOn && !isPlaying) rows.push({ mode: "alt", action: "playOn" });
    if (fromPlayhead) rows.push({ mode: "shift", action: "playPage" });
    return rows.length > 1 ? rows : [];
}
