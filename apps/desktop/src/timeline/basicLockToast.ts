import { toast } from "sonner";
import { useEditorModeStore } from "@/stores/EditorModeStore";

/** Switches to Expert (the Basic lock toast's action). */
export const switchToExpert = () =>
    useEditorModeStore.getState().setMode("expert");

/**
 * The one toast for marchers Basic can't edit (UI-19, V-203), offering **Switch to Expert**. Both
 * the dropped-before-writing path (`toastLockedMarchers`) and the writer's `notSimple` refusal
 * (`toastTimelineError`) show it, under one id so a second replaces the first.
 */
export function toastBasicLock(message: string): void {
    toast.warning(message, {
        id: "basic-locked-marchers",
        action: { label: "Switch to Expert", onClick: switchToExpert },
    });
}
