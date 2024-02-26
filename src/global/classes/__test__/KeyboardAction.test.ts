import { KeyboardAction } from "../KeyboardAction";

describe("KeyboardAction", () => {
    it("should create a KeyboardAction instance with default values", () => {
        const keyboardAction = new KeyboardAction({
            key: "q",
            desc: "lockX",
        });

        expect(keyboardAction.key).toEqual("q");
        expect(keyboardAction.desc).toEqual("lockX");
        expect(keyboardAction.control).toEqual(false);
        expect(keyboardAction.alt).toEqual(false);
        expect(keyboardAction.shift).toEqual(false);
        expect(keyboardAction.keyString).toEqual("Q");
        expect(keyboardAction.instructionalString).toEqual("lockX [Q]");
        expect(keyboardAction.instructionalStringToggleOn).toEqual("lockX [Q]");
        expect(keyboardAction.instructionalStringToggleOff).toEqual("lockX [Q]");
    });

    it("should create a KeyboardAction instance with custom values", () => {
        const keyboardAction = new KeyboardAction({
            key: "x",
            desc: "toggleY",
            control: true,
            alt: true,
            shift: true,
            toggleOnStr: "Enable Y axis",
            toggleOffStr: "Disable Y axis",
        });

        expect(keyboardAction.key).toEqual("x");
        expect(keyboardAction.desc).toEqual("toggleY");
        expect(keyboardAction.control).toEqual(true);
        expect(keyboardAction.alt).toEqual(true);
        expect(keyboardAction.shift).toEqual(true);
        expect(keyboardAction.keyString).toEqual("Ctrl + Alt + Shift + X");
        expect(keyboardAction.instructionalString).toEqual("toggleY [Ctrl + Alt + Shift + X]");
        expect(keyboardAction.instructionalStringToggleOn).toEqual("Enable Y axis [Ctrl + Alt + Shift + X]");
        expect(keyboardAction.instructionalStringToggleOff).toEqual("Disable Y axis [Ctrl + Alt + Shift + X]");
    });

    it("should create a KeyboardAction instance with control key", () => {
        const keyboardAction = new KeyboardAction({
            key: "q",
            desc: "lockX",
            control: true,
        });

        expect(keyboardAction.control).toEqual(true);
        expect(keyboardAction.shift).toEqual(false);
        expect(keyboardAction.alt).toEqual(false);
    });

    it("should create a KeyboardAction instance with alt key", () => {
        const keyboardAction = new KeyboardAction({
            key: "q",
            desc: "lockX",
            alt: true,
        });

        expect(keyboardAction.control).toEqual(false);
        expect(keyboardAction.shift).toEqual(false);
        expect(keyboardAction.alt).toEqual(true);
    });

    it("should create a KeyboardAction instance with shift key", () => {
        const keyboardAction = new KeyboardAction({
            key: "q",
            desc: "lockX",
            shift: true,
        });

        expect(keyboardAction.control).toEqual(false);
        expect(keyboardAction.shift).toEqual(true);
        expect(keyboardAction.alt).toEqual(false);
    });

    it("should generate the correct key string", () => {
        const keyString = KeyboardAction.makeKeyString({
            key: "q",
            control: true,
            alt: false,
            shift: true,
        });

        expect(keyString).toEqual("Ctrl + Shift + Q");
    });

    it("should compare two KeyboardAction instances for key equality", () => {
        const action1 = new KeyboardAction({
            key: "q",
            desc: "lockX",
            control: true,
            alt: false,
            shift: false,
        });

        const action2 = new KeyboardAction({
            key: "q",
            desc: "lockY",
            control: true,
            alt: false,
            shift: false,
        });

        const action3 = new KeyboardAction({
            key: "q",
            desc: "lockX",
            control: false,
            alt: true,
            shift: false,
        });

        const action4 = new KeyboardAction({
            key: "q",
            desc: "lockX",
            control: true,
            alt: false,
            shift: true,
        });

        expect(action1.keysEqual(action2)).toEqual(true);
        expect(action1.keysEqual(action3)).toEqual(false);
        expect(action1.keysEqual(action4)).toEqual(false);
    });
});
