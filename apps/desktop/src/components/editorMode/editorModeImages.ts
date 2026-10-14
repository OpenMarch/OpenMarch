import type { EditorMode } from "@/stores/EditorModeStore";
// Crops of the bottom bar from the real app (docs/timeline/research/basic-mode, "Welcome flow")
import basic from "@/assets/editor-mode/basic.webp";
import expert from "@/assets/editor-mode/expert.webp";

/** The picture on each editor mode card, in Settings and the welcome flow. */
export const editorModeImages: Record<EditorMode, string> = { basic, expert };

export { basic, expert };
