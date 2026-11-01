import { useEffect } from "react";
import { activeFieldEditor } from "@/field/editor/activeFieldEditor";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import {
    displayedBeat,
    useTimelineSelectionStore,
} from "@/stores/TimelineSelectionStore";
import { useTimelineResolverStore } from "@/timeline/timelineStore";
import { useShapeToolStore } from "../tool/shapeToolStore";
import { clickOnMarcher } from "./boxClick";
import {
    setInsideBox,
    useBoxSelectionStore,
    useSavingBoxStore,
} from "./boxSelectionStore";
import type { PlacedBox } from "./placedBox";
import {
    placedBoxesAt,
    usePlacedBoxStore,
    usePlacedBoxBeat,
} from "./placedBoxStore";

/** Selects `ids` on the field, through its editor, which writes the app's selection */
export function selectOnField(ids: readonly number[]): void {
    activeFieldEditor()?.select(ids);
}

const boxesNow = (): PlacedBox[] =>
    placedBoxesAt(displayedBeat(useTimelineSelectionStore.getState()));

const boxOf = (marcherId: number): PlacedBox | undefined =>
    boxesNow().find((b) =>
        b.recipe.members.some((m) => m.marcherId === marcherId),
    );

/**
 * The selection a press on marcher `hit` makes when placed boxes are on the field
 * (`FieldEditorPorts.pressSelection`), Figma-style (07-placed-boxes.md, `clickOnMarcher`): a
 * member selects its whole box, Shift adds or removes a whole box, and inside a box (after a
 * double click) Shift toggles one marcher. A press that reaches inside ($mod, `reachInside`) goes
 * inside the box and is then a press inside it: the editor picks the marcher. Null leaves the
 * press to the editor's rules. Also keeps which box you're inside. Off when the View tab's Shapes
 * setting is Off, during playback and while the Shape tool is open (`useBoxSelection` says so).
 */
export function boxPressSelection(
    hit: number,
    shift: boolean,
    selection: readonly number[],
    reachInside = false,
): readonly number[] | null {
    const state = useBoxSelectionStore.getState();
    if (!state.enabled) return null;
    const box = boxOf(hit) ?? null;
    const selected = new Set(selection);
    const out = clickOnMarcher({
        marcherId: hit,
        shift,
        reachInside,
        selected,
        box: box && {
            id: box.recipe.id,
            members: box.recipe.members.map((m) => m.marcherId),
        },
        inside: state.inside,
    });
    setInsideBox(out.inside);
    // A click on a member of a box selected whole keeps the box, where the editor's rule would
    // narrow the selection to that marcher (a drag moves the box either way)
    if (!out.select && box && out.inside === null && !shift) {
        const members = box.recipe.members.map((m) => m.marcherId);
        if (members.every((id) => selected.has(id))) return [...selection];
    }
    return out.select;
}

/**
 * Whether a press on marcher `hit` can reach inside ($mod, `FieldEditorPorts.reachesInside`): it's
 * a member of a placed box on the field while box selection is on, and you're not inside that box
 * already, where a click picks one marcher anyway and $mod stays `constrain`
 */
export function canReachInside(hit: number): boolean {
    const { enabled, inside } = useBoxSelectionStore.getState();
    if (!enabled) return false;
    const box = boxOf(hit);
    return box !== undefined && box.recipe.id !== inside;
}

/** Goes inside the box `marcherId` is in, selecting just that marcher */
export function enterBox(marcherId: number): void {
    if (!useBoxSelectionStore.getState().enabled) return;
    const box = boxOf(marcherId);
    if (!box) return;
    selectOnField([marcherId]);
    setInsideBox(box.recipe.id);
}

/** Leaves the box you're inside, selecting it whole again */
export function leaveBox(): void {
    const { inside } = useBoxSelectionStore.getState();
    const box = boxesNow().find((b) => b.recipe.id === inside);
    if (box) selectOnField(box.recipe.members.map((m) => m.marcherId));
    setInsideBox(null);
}

/**
 * Placed boxes in the field's selection: whether a click selects a whole box (on unless the View
 * tab's Shapes setting is Off, during playback or while the Shape tool is open), and
 * `useBoxSelectionStore.selected`, the box whose members are exactly the selection. You leave the
 * box you're inside when the selection leaves it (a click on the empty field, Escape).
 */
export function useBoxSelection({ isPlaying }: { isPlaying: boolean }): void {
    const mode = useUiSettingsStore((s) => s.uiSettings.shapes ?? "selected");
    const toolOpen = useShapeToolStore((s) => s.tool !== null);
    const enabled = mode !== "off" && !isPlaying && !toolOpen;
    useEffect(() => {
        useBoxSelectionStore.setState({ enabled });
    }, [enabled]);

    // The box selected as a whole: its members are exactly the selection
    const selected = useSelectedMarchers()?.selectedMarchers;
    const recipes = usePlacedBoxStore((s) => s.recipes);
    const version = useTimelineResolverStore((s) => s.version);
    const beat = usePlacedBoxBeat();
    const ends = usePlacedBoxStore((s) => s.ends);
    const saving = useSavingBoxStore((s) => s.box);
    useEffect(() => {
        const ids = new Set((selected ?? []).map((m) => m.id));
        const boxes = enabled ? placedBoxesAt(beat, recipes) : [];
        const exactly = (b: PlacedBox) =>
            b.recipe.members.length === ids.size &&
            b.recipe.members.every((m) => ids.has(m.marcherId));
        // Until its save is read back, a box being saved is selected as it will be: the positions
        // and recipes read back in between don't agree, and would drop or move it back
        const box =
            (enabled && saving && exactly(saving) ? saving : null) ??
            boxes.find(exactly) ??
            null;
        // Inside a box until the selection leaves it
        const { inside } = useBoxSelectionStore.getState();
        const insideBox = boxes.find((b) => b.recipe.id === inside);
        const stillInside =
            insideBox !== undefined &&
            ids.size > 0 &&
            [...ids].every((id) =>
                insideBox.recipe.members.some((m) => m.marcherId === id),
            );
        useBoxSelectionStore.setState({
            selected: box,
            ...(stillInside ? {} : { inside: null }),
        });
    }, [enabled, selected, recipes, ends, version, beat, saving]);
}
