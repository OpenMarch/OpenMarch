import { useTranslate } from "@tolgee/react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { fieldPropertiesKeys, marcherAppearancesKeys } from "@/hooks/queries";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useDatabaseReady } from "@/hooks/useDatabaseReady";
import { useEffect } from "react";
import { isPreviewMode, useIsPreviewMode } from "@/stores/PreviewModeStore";
import {
    FIELD_LINE_NUDGE_ACTION_IDS,
    type ActionArgs,
} from "@/shortcuts/definitions";
import {
    useActionHandler,
    useActionHandlerGroup,
} from "@/shortcuts/useActionHandler";
import { fieldEditMode, useFieldEditModeStore } from "./fieldEditModeStore";
import { useApplyFieldEdits, useFieldProperties } from "./useApplyFieldEdits";
import { DRAG_SNAP_STEPS, toRef } from "./lines";
import {
    everyOther,
    existingSelection,
    selectAll,
    walkLines,
} from "./lineSelection";
import {
    addLineEdit,
    deleteLinesEdit,
    nudgeLinesEdit,
    resetNamesEdits,
    toggleLinesEdit,
} from "./lineCommands";
import type { FieldEditResult } from "@/field/edits";
import { createCheckpointNamer } from "@/field/edits/messages";
import { fieldEditRefusal } from "@/field/edits/refusal";
import { focusFieldEditPane } from "./fieldEditPanes";
import { useFieldImageActions } from "./useFieldImageActions";
import {
    beginFieldEditSession,
    discardFieldEditSession,
    endFieldEditSession,
} from "./fieldEditSession";

/**
 * What owns its own keys when it has focus: a menu, a dialog (the template sheet) and form
 * controls (switches, inputs, sliders, selects, segmented switches). A key pressed there is the
 * control's, never the mode's.
 */
const OWNS_KEYS = [
    "[role=menu]",
    "[role=menuitem]",
    "[role=dialog]",
    "[role=alertdialog]",
    "input",
    "textarea",
    "select",
    "[contenteditable]:not([contenteditable=false])",
    "[role=switch]",
    "[role=checkbox]",
    "[role=radio]",
    "[role=radiogroup]",
    "[role=slider]",
    "[role=spinbutton]",
    "[role=combobox]",
    "[role=tab]",
    // A listbox, but not the Field panel's list of lines: its rows stand for lines
    "[role=listbox]:not([data-field-line-list])",
].join(", ");

/** The element a key press being handled now went to, or null for anything else */
function keyTarget(): HTMLElement | null {
    // The event being handled right now, when there is one (deprecated, but the one way to
    // tell a key's run from a click's inside `enabled`)
    const current = (window as { event?: Event }).event;
    if (!(current instanceof KeyboardEvent)) return null;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body)
        return null;
    return active;
}

/**
 * Whether Tab or Enter belongs to the field rather than a control: on a focused button, field
 * or row in the Field panel they're that control's (Tab moves on, Enter presses it),
 * and in a menu, dialog or field they're theirs. Anything that isn't a key press (a menu
 * entry, a button, the palette) is the field's.
 */
export function keyIsForField(): boolean {
    const active = keyTarget();
    if (!active) return true;
    if (active.closest(OWNS_KEYS)) return false;
    return (
        active.closest("[data-field-edit-overlay]") !== null ||
        active.closest("[data-testid='threeField']") !== null ||
        // Enter on a row of the Field panel's list goes to its line's Position
        active.closest("[data-field-line-list] [role=option]") !== null
    );
}

/**
 * Whether a single key (Delete, H, R, M, X, Y, the arrows, ⌘A) acts on the lines: anywhere but
 * in a menu, a dialog or a form control, whose keys are their own (an arrow moves a slider, H in
 * a name is typed). A focused button keeps none of these, so after clicking Delete in the panel
 * the arrows still nudge.
 */
export function keyIsForLines(): boolean {
    const active = keyTarget();
    return !active || active.closest(OWNS_KEYS) === null;
}

/**
 * What Escape belongs to before the panel: a menu, a dialog or picker, and a text or number field.
 * A focused tab, switch or button doesn't keep it, so Escape there still steps back.
 */
const OWNS_ESCAPE = [
    "[role=menu]",
    "[role=menuitem]",
    "[role=dialog]",
    "[role=alertdialog]",
    "[role=listbox]:not([data-field-line-list])",
    "input:not([type=checkbox]):not([type=radio])",
    "textarea",
    "select",
    "[contenteditable]:not([contenteditable=false])",
    "[role=combobox]",
].join(", ");

/** Whether Escape is the panel's (Done's ladder) rather than a control's */
export function escapeIsForPanel(): boolean {
    const active = keyTarget();
    return !active || active.closest(OWNS_ESCAPE) === null;
}

/** Selects the lines an add made, so the next key (Enter, H, Delete) acts on them */
export function selectAdded(result: FieldEditResult | null) {
    const added = result?.diff.ok ? result.diff.checkpoints.added : [];
    // Of a mirrored pair, side 2's: the one the list's row stands for
    const lead = added.find((c) => c.stepsFromCenterFront >= 0) ?? added[0];
    if (lead) fieldEditMode.select([toRef(lead)]);
}

/**
 * Opening the Field panel (#824): the two of its actions that work while it's shut. Edit field
 * opens it on Setup (or shuts it); Edit field lines opens it on Lines.
 */
export function useFieldEditModeEntry() {
    const databaseReady = useDatabaseReady();
    const { setSelectedMarchers } = useSelectedMarchers() ?? {};
    // The panel belongs to the show that's open: a show opening starts with it shut, and closing
    // the show (or switching to another) shuts it, with nothing picked, open or dragged
    useEffect(() => {
        fieldEditMode.exit();
        return () => fieldEditMode.exit();
    }, []);
    // Done, Preview, another panel or the show closing: the changes stay, and there's nothing
    // left for the panel's X to put back
    useEffect(
        () =>
            useFieldEditModeStore.subscribe((state, before) => {
                if (before.active && !state.active) endFieldEditSession();
            }),
        [],
    );
    // Preview edits nothing: switching to it shuts the panel
    const preview = useIsPreviewMode();
    useEffect(() => {
        if (preview) fieldEditMode.exit();
    }, [preview]);
    const open = (lines = false) => {
        // The drill can't be picked while the panel is open: nothing stays selected to be
        // nudged or deleted by a key meant for the field
        setSelectedMarchers?.([]);
        // Remembered for the panel's X, before anything can change
        beginFieldEditSession();
        fieldEditMode.enter({ lines });
    };
    const enabled = () => databaseReady && !isPreviewMode();
    useActionHandler(
        "fieldEditMode",
        () => {
            if (fieldEditMode.isActive()) fieldEditMode.exit();
            else open();
        },
        { enabled },
    );
    useActionHandler(
        "fieldEditLines",
        () => {
            if (fieldEditMode.isActive()) fieldEditMode.setTab("lines");
            else open(true);
        },
        { enabled },
    );
}

/**
 * The Field panel's own keys (#824): Done, X, the image's commands and F6. Mounted only while the
 * panel is open, so outside it none of these is in the palette.
 */
export function useFieldPanelActions() {
    const fp = useFieldProperties();
    useFieldImageActions(fp);

    // Done (the panel, the palette) shuts the panel at once. Escape drops the pick first, then
    // shuts the panel as Done does
    useActionHandler("fieldEditDone", () => fieldEditMode.exit(), {
        onPress: () => {
            if (fieldEditMode.get().selection.length > 0)
                return fieldEditMode.select([]);
            fieldEditMode.exit();
        },
        // Escape in a menu, dialog, picker or field is that control's
        enabled: escapeIsForPanel,
    });

    useFieldEditDiscard();

    // ⌘A / Ctrl+A: never the marchers while the panel is open (they can't be picked); on the
    // Lines tab the lines of the list showing, and nothing otherwise. Here rather than in the line
    // keys, so it's on top of the drill's own handler from the moment the panel opens
    useActionHandler(
        "selectAllMarchers",
        () =>
            fp && fieldEditMode.select(selectAll(fp, fieldEditMode.get().axis)),
        {
            enabled: () =>
                !!fp && fieldEditMode.isEditingLines() && keyIsForLines(),
        },
    );

    // F6 and Shift+F6: the keyboard's way between the field (where Tab walks lines) and
    // the Field panel
    useActionHandler("fieldEditNextPane", () => focusFieldEditPane(1));
    useActionHandler("fieldEditPreviousPane", () => focusFieldEditPane(-1));
}

/**
 * The Lines tab's keys and commands (#824). Mounted only while it's showing, so otherwise none of
 * these is in the palette and their keys do nothing (the drill's are off while the panel is open).
 */
export function useFieldLineActions() {
    const { t } = useTranslate();
    const fp = useFieldProperties();
    const apply = useApplyFieldEdits();
    const selection = useFieldEditModeStore((s) => s.selection);
    const mirror = useFieldEditModeStore((s) => s.mirror);
    const hasSelection = fp
        ? existingSelection(fp, selection).length > 0
        : false;
    const manySelected = fp
        ? existingSelection(fp, selection).length > 1
        : false;
    // Read when run, not from the render: a button can pick a line and run an action at once
    const now = () =>
        fp ? existingSelection(fp, fieldEditMode.get().selection) : [];
    const mirrorNow = () => fieldEditMode.get().mirror;

    useActionHandler(
        "fieldEditMirror",
        () => fieldEditMode.setMirror(!fieldEditMode.get().mirror),
        {
            label: t(
                mirror ? "actions.field.mirrorOff" : "actions.field.mirrorOn",
            ),
            enabled: keyIsForLines,
        },
    );

    const addAt = (axis: "x" | "y") => {
        if (!fp) return;
        const pointer = fieldEditMode.get().pointer;
        // At the pointer when it's over the field (whole steps), else halfway into the largest gap
        let steps: number | undefined;
        if (pointer) {
            const raw = axis === "x" ? pointer.x : pointer.y;
            steps = Math.round(raw / DRAG_SNAP_STEPS) * DRAG_SNAP_STEPS;
            if (axis === "y") steps = Math.min(0, steps);
            steps = steps === 0 ? 0 : steps;
        }
        void apply(addLineEdit(axis, steps, mirrorNow())).then(selectAdded);
    };
    useActionHandler("fieldEditAddXLine", () => addAt("x"), {
        enabled: () => !!fp && keyIsForLines(),
    });
    useActionHandler("fieldEditAddYLine", () => addAt("y"), {
        enabled: () => !!fp && keyIsForLines(),
    });

    useActionHandler(
        "fieldEditEditLine",
        () => {
            const current = now();
            const last = current[current.length - 1];
            if (last) fieldEditMode.editPosition(last);
        },
        { enabled: () => hasSelection && keyIsForField() },
    );

    // Greyed out where it would be refused (the last two lines on an axis stay), saying why,
    // instead of a toast after the press
    const deleteRefusal = () =>
        fp
            ? fieldEditRefusal(fp, deleteLinesEdit(fp, now(), mirrorNow()), t)
            : undefined;
    useActionHandler(
        "fieldEditDeleteLines",
        () => {
            if (!fp) return;
            const edit = deleteLinesEdit(fp, now(), mirrorNow());
            if (!edit) return;
            void apply(edit).then((result) => {
                if (result?.diff.ok) fieldEditMode.select([]);
            });
        },
        {
            enabled: () =>
                hasSelection &&
                keyIsForLines() &&
                deleteRefusal() === undefined,
            disabledReason: () =>
                hasSelection && keyIsForLines() ? deleteRefusal() : undefined,
        },
    );

    useActionHandler(
        "fieldEditToggleVisible",
        () => {
            const edit =
                fp && toggleLinesEdit(fp, now(), "visible", mirrorNow());
            if (edit) void apply(edit);
        },
        { enabled: () => hasSelection && keyIsForLines() },
    );
    useActionHandler(
        "fieldEditToggleReference",
        () => {
            const edit =
                fp && toggleLinesEdit(fp, now(), "useAsReference", mirrorNow());
            if (edit) void apply(edit);
        },
        { enabled: () => hasSelection && keyIsForLines() },
    );

    useActionHandler(
        "fieldEditNextLine",
        () => fp && fieldEditMode.select(walkLines(fp, now(), 1)),
        { enabled: () => !!fp && keyIsForField() },
    );
    useActionHandler(
        "fieldEditPreviousLine",
        () => fp && fieldEditMode.select(walkLines(fp, now(), -1)),
        { enabled: () => !!fp && keyIsForField() },
    );

    const selectEvery = () => fp && fieldEditMode.select(selectAll(fp));
    useActionHandler("fieldEditSelectAllLines", selectEvery, {
        enabled: !!fp,
    });
    useActionHandler(
        "fieldEditSelectAllXLines",
        () => fp && fieldEditMode.select(selectAll(fp, "x")),
        { enabled: !!fp },
    );
    useActionHandler(
        "fieldEditSelectAllYLines",
        () => fp && fieldEditMode.select(selectAll(fp, "y")),
        { enabled: !!fp },
    );
    useActionHandler(
        "fieldEditEveryOther",
        () => fp && fieldEditMode.select(everyOther(fp, now())),
        { enabled: manySelected },
    );
    // Greyed out when the lines already have their automatic names, saying so
    const resetEdits = () =>
        fp
            ? resetNamesEdits(fp, now(), mirrorNow(), createCheckpointNamer(t))
            : [];
    useActionHandler(
        "fieldEditResetNames",
        () => {
            const edits = resetEdits();
            if (edits.length > 0) void apply(edits);
        },
        {
            enabled: () => hasSelection && resetEdits().length > 0,
            disabledReason: () =>
                hasSelection
                    ? t("fieldEditMode.namesAlreadyAutomatic")
                    : undefined,
        },
    );

    useActionHandlerGroup(
        FIELD_LINE_NUDGE_ACTION_IDS,
        (_id, args: ActionArgs | undefined) => {
            if (!fp) return;
            const direction = String(args?.direction);
            const steps = Number(args?.steps ?? 1);
            const axis =
                direction === "left" || direction === "right" ? "x" : "y";
            // Up on screen is toward the back: fewer steps from the front
            const by =
                direction === "right" || direction === "down" ? steps : -steps;
            const edit = nudgeLinesEdit(fp, now(), axis, by, mirrorNow());
            if (edit) void apply(edit);
        },
        { enabled: () => hasSelection && keyIsForLines() },
    );
}

/**
 * The panel's X: shuts it at once and puts the field back as it was when the panel opened, as one
 * undo step, so undo brings the discarded changes back
 */
function useFieldEditDiscard() {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    useActionHandler("fieldEditDiscard", () => {
        // Takes the remembered field before leaving forgets it
        const discarding = discardFieldEditSession();
        fieldEditMode.exit();
        void discarding
            .then(async (changed) => {
                if (!changed) return;
                await queryClient.invalidateQueries({
                    queryKey: fieldPropertiesKeys.all,
                });
                await queryClient.invalidateQueries({
                    queryKey: marcherAppearancesKeys.all(),
                });
                toast(t("fieldEditMode.panel.discarded"));
            })
            .catch((error) => {
                console.error("Discarding the field changes failed", error);
                toast.error(t("fieldEdits.issues.invalid"));
            });
    });
}
