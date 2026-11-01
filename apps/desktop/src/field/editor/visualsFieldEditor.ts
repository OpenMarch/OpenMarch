import { takeFieldPoint } from "../fieldPointPick";
import {
    FieldEditor,
    type DropResult,
    type FieldEditorOptions,
    type FieldEditorPorts,
    type FieldGesture,
    type FieldPointer,
    type FieldPress,
} from "./fieldEditor";

/**
 * The field editor with what Visuals mode needs (performer-behavior.md
 * section 7.1), built on the editor's ports and public methods only:
 *
 * - A press while something asks for a field point (`requestFieldPoint`, a
 *   Facing cue toward a point) is that point, and nothing more.
 * - Read-only ({@link setReadOnly}): clicks, the marquee and the lasso still
 *   select, as the selection is who a cue is for, but no drag, scale, rotation
 *   or typed rotation moves a marcher: no move starts, nothing is drawn moved
 *   and nothing drops, and no field mode (a shape tool) is on.
 */
export class VisualsFieldEditor extends FieldEditor {
    private readOnly = false;
    /** The press being handed to the editor, for the field point's port. */
    private pressing: FieldPointer | null = null;

    constructor(ports: FieldEditorPorts, options?: FieldEditorOptions) {
        const self: { editor?: VisualsFieldEditor } = {};
        super(
            {
                ...ports,
                takePress: () => {
                    const pointer = self.editor?.pressing;
                    if (pointer && takeFieldPoint(pointer.field)) return true;
                    return ports.takePress?.() ?? false;
                },
                // Read-only draws nothing moved; clearing still goes through
                showPositions: (positions) => {
                    if (positions === null || !self.editor?.readOnly)
                        ports.showPositions(positions);
                },
                drop: (positions) =>
                    self.editor?.readOnly
                        ? Promise.resolve<DropResult>("refused")
                        : ports.drop(positions),
            },
            options,
        );
        self.editor = this;
        this.holdModesWhileReadOnly();
    }

    /**
     * A field mode (the shape tool, a selected placed box) takes edit presses
     * before the editor's own rules, on editors that have them (`setMode`).
     * While read-only none is on: one asked for then waits, and comes back
     * when read-only ends.
     */
    private wantedMode: unknown = null;
    private setModeNow: ((mode: unknown) => void) | null = null;

    private holdModesWhileReadOnly(): void {
        const editor = this as { setMode?(mode: unknown): void };
        const setMode = editor.setMode?.bind(this);
        if (!setMode) return;
        this.setModeNow = setMode;
        editor.setMode = (mode) => {
            this.wantedMode = mode;
            setMode(this.readOnly ? null : mode);
        };
    }

    override pointerDown(pointer: FieldPointer): boolean {
        this.pressing = pointer;
        try {
            return super.pointerDown(pointer);
        } finally {
            this.pressing = null;
        }
    }

    /**
     * Turns read-only on or off. Turning it on ends any drag and drops a
     * rotation typed in the inspector without saving it.
     */
    setReadOnly(readOnly: boolean): void {
        if (readOnly === this.readOnly) return;
        if (readOnly) {
            this.pointerCancel();
            this.cancelRotation();
            // The line tool, where the editor still has one
            (this as { setLineTool?(ids: null): void }).setLineTool?.(null);
            // Any field mode, kept to come back after
            this.setModeNow?.(null);
        }
        this.readOnly = readOnly;
        if (!readOnly) this.setModeNow?.(this.wantedMode);
    }

    /** Whether presses only select ({@link setReadOnly}). */
    isReadOnly(): boolean {
        return this.readOnly;
    }

    /**
     * No move while read-only: a press that would drag still selects as it
     * does, but starts no gesture, so nothing follows the keys and no chip
     * names roles nothing honors.
     */
    protected override startDrag(
        press: FieldPress,
        pointer: FieldPointer,
    ): FieldGesture | null {
        const gesture = super.startDrag(press, pointer);
        if (!this.readOnly || gesture?.kind !== "move") return gesture;
        gesture.cancel();
        return null;
    }

    /** Nothing scales or rotates while read-only. */
    override canTransform(): boolean {
        return !this.readOnly && super.canTransform();
    }

    override rotateSelection(
        ...args: Parameters<FieldEditor["rotateSelection"]>
    ): void {
        if (!this.readOnly) super.rotateSelection(...args);
    }
}
