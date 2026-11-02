import { create } from "zustand";
import { CLICK_FOCUS_ATTRIBUTE } from "@/utilities/clickFocus";
import type { PivotKey } from "../frame/frame";

/**
 * Where the pointer and keyboard are for the shape on the field: the open shape, or the selected
 * placed one (#403, #430). One signal for both, so they calm down and come back the same way.
 * `over`: the pointer is over the shape or one of its controls. `dragging`: a placed shape's
 * gesture is under way (the open shape's own gesture is in its tool state). `editorFocus`:
 * keyboard focus is inside the floating editor, typing a number counting. `pivotPreview`: the
 * pivot a cell of the editor's pivot menu points at, under the pointer or keyboard focus (#437):
 * shown on the field, never stored. `scrubbing`: a spacing number in the editor is being dragged,
 * so the field shows the guides a corner or center lands on (#452). `groupMenu`: the editor's menu
 * of a Line's interval groups is open, and the group whose row is pointed at, focused or edited
 * (`lit`, null for none), for the field to color each group's spots (#526 follow-up). `stepShown`:
 * a number that sets the kind's step (a Line's offset) is pointed at, focused or dragged, so the
 * field draws the step and lights the pivot it grows from (owner on #596).
 */
export const useShapePointerStore = create<{
    over: boolean;
    dragging: boolean;
    editorFocus: boolean;
    pivotPreview: PivotKey | null;
    scrubbing: boolean;
    groupMenu: GroupMenuState | null;
    stepShown: boolean;
}>(() => ({
    over: false,
    dragging: false,
    editorFocus: false,
    pivotPreview: null,
    scrubbing: false,
    groupMenu: null,
    stepShown: false,
}));

/** The editor's group menu while it's open: the group lit on the field, or null for none */
export interface GroupMenuState {
    readonly lit: number | null;
}

/** Notes the group menu opening, closing (null) or lighting another group */
export function setGroupMenu(groupMenu: GroupMenuState | null): void {
    const was = useShapePointerStore.getState().groupMenu;
    if (was?.lit !== groupMenu?.lit || (was === null) !== (groupMenu === null))
        useShapePointerStore.setState({ groupMenu });
}

/** The numbers engaged now (pointed at, focused or dragged), each by its own key */
const stepEngaged = new Set<string>();

/**
 * Notes a number that sets the kind's step (`ToolParam.showsStep`) engaged or let go, by `key`:
 * the field draws the step while any is (owner on #596)
 */
export function engageStep(key: string, on: boolean): void {
    if (on) stepEngaged.add(key);
    else stepEngaged.delete(key);
    const stepShown = stepEngaged.size > 0;
    if (useShapePointerStore.getState().stepShown !== stepShown)
        useShapePointerStore.setState({ stepShown });
}

/** Notes whether a spacing number in the floating editor is being dragged (#452) */
export function setShapeScrubbing(scrubbing: boolean): void {
    if (useShapePointerStore.getState().scrubbing !== scrubbing)
        useShapePointerStore.setState({ scrubbing });
}

/**
 * The gesture the guides follow: a spacing drag in the shape's editor (#452), which the open shape
 * holds as an edit, or else the shape's own
 */
export function guideGesture(
    gesture: { readonly type: string } | null | undefined,
    scrubbing: boolean,
): { readonly type: string } | null {
    return scrubbing ? SCRUB : (gesture ?? null);
}
const SCRUB = { type: "scrub" } as const;

/** Shows where a pivot would be on the field while its cell is pointed at; null hides it */
export function setPivotPreview(pivotPreview: PivotKey | null): void {
    if (useShapePointerStore.getState().pivotPreview !== pivotPreview)
        useShapePointerStore.setState({ pivotPreview });
}

/** Notes whether the pointer is over the shape or one of its controls */
export function setShapePointerOver(over: boolean): void {
    if (useShapePointerStore.getState().over !== over)
        useShapePointerStore.setState({ over });
}

/** Notes whether a placed shape's gesture is under way */
export function setShapeDragging(dragging: boolean): void {
    if (useShapePointerStore.getState().dragging !== dragging)
        useShapePointerStore.setState({ dragging });
}

/** Another shape (or none) takes the field: the last one's pointer and gesture don't carry over */
export function resetShapePointer(): void {
    setShapePointerOver(false);
    setShapeDragging(false);
    setPivotPreview(null);
    setShapeScrubbing(false);
    setGroupMenu(null);
    stepEngaged.clear();
    engageStep("", false);
}

/**
 * Whether the shape's controls are calm: the pointer away from it, no gesture under way and no
 * keyboard focus in its editor (#403, #430). Never on a screen that can't hover (fingers, an
 * Apple Pencil): the pointer is only "over" mid-press there, so the controls stay solid, as the
 * floating editor does (ShapeEditorSurface.css).
 */
export function shapeCalm(gesture: boolean): boolean {
    if (!canHover()) return false;
    const { over, dragging, editorFocus } = useShapePointerStore.getState();
    return !over && !gesture && !dragging && !editorFocus;
}

const canHover = () =>
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(hover: hover)").matches;

/** Keyboard focus as `ShapeEditorSurface.css` has it: not focus a click left on a button */
function editorHasKeyFocus(doc: Document): boolean {
    const el = doc.activeElement;
    return (
        !!el?.closest("[data-shape-editor]") &&
        el.matches(":focus-visible") &&
        !el.hasAttribute(CLICK_FOCUS_ATTRIBUTE)
    );
}

/**
 * Follows keyboard focus in the floating editor. A key can turn click focus into keyboard focus
 * (`clickFocus.ts`), and the click-focus mark is set as focus arrives, so it looks once the event
 * is through. Returns the cleanup.
 */
export function watchShapeEditorFocus(doc: Document = document): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            const editorFocus = editorHasKeyFocus(doc);
            if (useShapePointerStore.getState().editorFocus !== editorFocus)
                useShapePointerStore.setState({ editorFocus });
        });
    };
    const events = ["focusin", "focusout", "keydown"] as const;
    for (const e of events) doc.addEventListener(e, check, true);
    check();
    return () => {
        if (timer !== null) clearTimeout(timer);
        for (const e of events) doc.removeEventListener(e, check, true);
        useShapePointerStore.setState({ editorFocus: false });
    };
}
