/**
 * Any action that can be triggered by a keyboard shortcut.
 */
export class KeyboardAction {
    /** The key to press to trigger the action (not case sensitive). E.g. "q" */
    readonly key: string;
    /** The description of the action. E.g. "lockX" */
    readonly desc: string;
    /** True if the control key needs to be held down (Command in macOS)*/
    readonly control: boolean;
    /** True if the alt key needs to be held down (option in macOS) */
    readonly alt: boolean;
    /** True if the shift key needs to be held down */
    readonly shift: boolean;
    /** The string to display in the UI for the keyboard shortcut. Eg. "Snap to nearest whole [Shift + X]" */
    readonly instructionalString: string;
    /** Instructional string to toggle on the given action (only relevant for toggle-based actions)
     * E.g. "Enable X axis [Shift + X]" */
    readonly instructionalStringToggleOn: string;
    /** Instructional string to toggle off the given action (only relevant for toggle-based actions)
     * E.g. "Lock X axis [Shift + X]" */
    readonly instructionalStringToggleOff: string;
    /** The string to use as a key in a map, which is also all of the keys that are pressed to perform the action.
     * It includes the key pressed and the control, alt, and shift key modifiers.
     * E.g. "Ctrl + Shift + A" */
    readonly keyString: string;

    constructor({ key, desc, action, control = false, alt = false, shift = false, toggleOnStr, toggleOffStr }:
        { key: string; desc: string; action?: () => any; control?: boolean; alt?: boolean; shift?: boolean; toggleOnStr?: string; toggleOffStr?: string; }) {

        this.key = key.toLowerCase();
        this.desc = desc;
        // this.action = action || (() => console.error(`No action registered for ${desc}`));
        this.control = control;
        this.alt = alt;
        this.shift = shift;
        this.keyString = KeyboardAction.makeKeyString({ key, control, alt, shift });
        this.instructionalString = this.makeInstructionalString();
        this.instructionalStringToggleOn = `${toggleOnStr || desc} [${this.keyString}]`;
        this.instructionalStringToggleOff = `${toggleOffStr || desc} [${this.keyString}]`;
    }

    private makeInstructionalString() {
        return `${this.desc} [${this.keyString}]`;
    }

    /**
     * Returns a string representation of the key and modifiers.
     * @returns The string representation of the key and modifiers. E.g. "Ctrl + Shift + Q"
     */
    static makeKeyString({ key, control = false, alt = false, shift = false }:
        { key: string; control?: boolean; alt?: boolean; shift?: boolean; }) {
        const keyStr = key === " " ? "Space" : key.toUpperCase();
        return `${control ? "Ctrl + " : ""}${alt ? "Alt + " : ""}${shift ? "Shift + " : ""}${keyStr}`
    }

    /**
     * Returns true if the actions' keys are equal. (including control, alt, and shift keys)
     * @param action The action to compare
     * @returns True if the actions keys are equal
     */
    keysEqual(action: KeyboardAction) {
        return this.key === action.key
            && this.control === action.control
            && this.alt === action.alt
            && this.shift === action.shift;
    }

    /**
     * Equality check for the action. Returns true if the keys and description are equal.
     * @param action
     * @returns
     */
    equals(action: KeyboardAction) {
        return this.keysEqual(action)
            && this.desc === action.desc;
    }
}
