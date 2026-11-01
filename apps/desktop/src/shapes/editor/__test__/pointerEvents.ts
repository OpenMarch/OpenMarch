// jsdom has no PointerEvent, so fireEvent's pointer events would lose clientX and the keys
if (typeof window.PointerEvent === "undefined") {
    class TestPointerEvent extends MouseEvent {
        readonly pointerId: number;
        readonly pointerType: string;
        constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
            this.pointerType = init.pointerType ?? "mouse";
        }
    }
    window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;
}

/** jsdom has no pointer capture: a stand-in until the returned restore runs */
export function stubPointerCapture(): () => void {
    const own = Object.getOwnPropertyDescriptor(
        HTMLElement.prototype,
        "setPointerCapture",
    );
    HTMLElement.prototype.setPointerCapture = () => {};
    return () => {
        if (own)
            Object.defineProperty(
                HTMLElement.prototype,
                "setPointerCapture",
                own,
            );
        else
            delete (HTMLElement.prototype as Partial<HTMLElement>)
                .setPointerCapture;
    };
}
