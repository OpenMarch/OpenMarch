import { isPreviewMode } from "@/stores/PreviewModeStore";
import type { ActionId } from "./definitions";

/**
 * What still works in Preview, which edits nothing: files, exports, page and beat navigation,
 * playback (but the loop: Preview always plays on), go-to, and the app's own windows and lists.
 * Everything else, the selection and undo included, is off.
 */
const PREVIEW_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
    "launchLoadFileDialogue",
    "launchSaveFileDialogue",
    "launchNewFileDialogue",
    "closeFile",
    "openExportDialog",
    "exportCoordinateSheets",
    "exportDrillCharts",
    "exportVideo",
    "exportToMobile",
    "nextPage",
    "lastPage",
    "previousPage",
    "firstPage",
    "nextBeat",
    "previousBeat",
    "playPause",
    "playPage",
    "playOn",
    "holdFasterPlayback",
    "holdSlowerPlayback",
    "nextPlaybackSpeed",
    "previousPlaybackSpeed",
    "resetPlaybackSpeed",
    "toggleMetronome",
    "timelineGoTo",
    "openSettings",
    "openView3d",
    "showShortcuts",
    "showWhatsNew",
    "openCommandPalette",
    "togglePreview",
]);

/**
 * Whether the workspace on screen turns `id` off, from a key, the palette or a button: Preview
 * edits nothing, so only `PREVIEW_ACTIONS` work there.
 */
export function isActionOffInWorkspace(id: ActionId): boolean {
    return isPreviewMode() && !PREVIEW_ACTIONS.has(id);
}
