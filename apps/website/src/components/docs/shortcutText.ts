type Shortcut = { keys: string[]; gesture?: string };

/**
 * A shortcut as one line of plain text, for the llms.txt files (starlight-llms-txt), which read
 * the page's HTML: "Ctrl+Shift+Z (Mac: ⇧⌘Z)", "Shift drag (Mac: ⇧ drag)", or just "Esc" when
 * both systems write it the same. The components put it in a `.docs-kbd-text` span, which the
 * site hides (src/styles/starlight.css) and the llms.txt files keep instead of the visible caps
 * (astro.config.mjs). Not the `hidden` attribute: the plugin drops hidden text.
 */
export function shortcutText(
    other: Shortcut,
    mac: Shortcut | undefined,
    gesture?: string,
): string {
    const word = gesture ?? other.gesture;
    const tail = word ? ` ${word}` : "";
    const otherText = other.keys.join("+") + tail;
    const macText = mac ? mac.keys.join("") + tail : otherText;
    return macText === otherText ? otherText : `${otherText} (Mac: ${macText})`;
}
