import {
    useCallback,
    useEffect,
    useSyncExternalStore,
    type ComponentProps,
} from "react";
import { DragInput } from "@openmarch/ui";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import {
    activeFieldEditor,
    subscribeActiveFieldEditor,
} from "@/field/editor/activeFieldEditor";
import type { FieldEditor } from "@/field/editor/fieldEditor";
import { useSelectedMarchers } from "@/context/SelectedMarchersContext";

/** Rotates the selection on the field on screen, through its editor. */
function MarcherRotationInput() {
    const editor = useSyncExternalStore(
        subscribeActiveFieldEditor,
        activeFieldEditor,
    );
    return editor ? (
        <FieldRotationInput editor={editor} />
    ) : (
        <RotationDragInput value={0} disabled />
    );
}

/** The rotation input's look and rounding, shared by every state */
function RotationDragInput(
    props: Pick<
        ComponentProps<typeof DragInput>,
        | "value"
        | "disabled"
        | "onDragChange"
        | "onChange"
        | "onBlur"
        | "onDragEnd"
    >,
) {
    return (
        <div className="flex flex-col gap-8">
            <DragInput
                dragSensitivity={0.5}
                dragSensitivityWithShift={0.1}
                roundToNearest={15}
                roundToNearestWithShift={1}
                icon={ArrowClockwiseIcon}
                aria-label="Rotation"
                {...props}
            />
        </div>
    );
}

/**
 * The new field's rotation (#198, user story 54): typing or dragging turns
 * the selection about its box's center through the editor, as the rotate
 * handle does, and leaving the input saves it through the same drop. Left
 * unchanged, it saves nothing. It shows what's typed until the rotation
 * ends, then 0 again: the selection's box fits it again. A press on the
 * field saves it before the blur does.
 */
function FieldRotationInput({ editor }: { editor: FieldEditor }) {
    const subscribe = useCallback(
        (listener: () => void) => editor.subscribe(listener),
        [editor],
    );
    // Each ended rotation starts the input over at 0. Its value isn't the
    // editor's, so typing "22." isn't rewritten as "22" mid-number
    const ended = useSyncExternalStore(subscribe, () =>
        editor.rotationVersion(),
    );
    // The context holds no hidden marchers, as the editor's handles skip them
    const canRotate = useSelectedMarchers()!.selectedMarchers.length >= 2;
    const save = () => editor.endRotation();
    // Gone without a blur: nothing typed stays drawn and unsaved
    useEffect(() => () => editor.cancelRotation(), [editor]);

    return (
        <RotationDragInput
            key={ended}
            value={0}
            onDragChange={(value) => editor.rotateSelection(value)}
            onChange={(value) => editor.rotateSelection(value)}
            onBlur={save}
            onDragEnd={save}
            disabled={!canRotate}
        />
    );
}

export default MarcherRotationInput;
