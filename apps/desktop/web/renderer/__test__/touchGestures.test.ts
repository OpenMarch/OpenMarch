// cspell:words gesturestart uncancelable
import { afterEach, describe, expect, it } from "vitest";
import {
    ownsGestures,
    shouldBlockTouchMove,
    shouldBlockWheel,
    startTouchGestureGuard,
} from "../touchGestures";

afterEach(() => {
    document.body.innerHTML = "";
});

describe("ownsGestures", () => {
    it("counts the canvas, the timeline and marked elements", () => {
        document.body.innerHTML = `
            <div id="wrap"><canvas id="c"></canvas></div>
            <div id="timeline"><span id="t"></span></div>
            <div data-own-gestures><b id="m"></b></div>
            <div id="plain"><i id="p"></i></div>`;
        const none = () => "auto";
        expect(ownsGestures(document.getElementById("c"), none)).toBe(true);
        expect(ownsGestures(document.getElementById("t"), none)).toBe(true);
        expect(ownsGestures(document.getElementById("m"), none)).toBe(true);
        expect(ownsGestures(document.getElementById("p"), none)).toBe(false);
        expect(ownsGestures(null, none)).toBe(false);
    });
    it("counts elements inside touch-action: none", () => {
        document.body.innerHTML = `<div id="outer"><i id="inner"></i></div>`;
        const touchAction = (element: Element) =>
            element.id === "outer" ? "none" : "auto";
        expect(
            ownsGestures(document.getElementById("inner"), touchAction),
        ).toBe(true);
    });
});

describe("shouldBlockTouchMove", () => {
    it("blocks two-finger moves outside gesture owners", () => {
        expect(shouldBlockTouchMove(2, false, true)).toBe(true);
    });
    it("leaves one finger, owners and uncancelable moves alone", () => {
        expect(shouldBlockTouchMove(1, false, true)).toBe(false);
        expect(shouldBlockTouchMove(2, true, true)).toBe(false);
        expect(shouldBlockTouchMove(2, false, false)).toBe(false);
    });
});

describe("shouldBlockWheel", () => {
    const wheel = (ctrlKey: boolean, metaKey: boolean, cancelable = true) =>
        shouldBlockWheel(
            new WheelEvent("wheel", { ctrlKey, metaKey, cancelable }),
        );
    it("blocks pinches and Ctrl + wheel", () => {
        expect(wheel(true, false)).toBe(true);
    });
    it("leaves plain scrolling, Cmd + scroll and uncancelable wheels alone", () => {
        expect(wheel(false, false)).toBe(false);
        expect(wheel(false, true)).toBe(false);
        expect(wheel(true, false, false)).toBe(false);
    });
});

describe("startTouchGestureGuard", () => {
    it("cancels Safari's gesture events until stopped", () => {
        const stop = startTouchGestureGuard();
        const event = new Event("gesturestart", { cancelable: true });
        document.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        stop();
        const after = new Event("gesturestart", { cancelable: true });
        document.dispatchEvent(after);
        expect(after.defaultPrevented).toBe(false);
    });
    it("cancels a pinch over a panel but not a plain scroll", () => {
        document.body.innerHTML = `<div id="panel"></div>`;
        const stop = startTouchGestureGuard();
        const panel = document.getElementById("panel")!;
        const pinch = new WheelEvent("wheel", {
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        panel.dispatchEvent(pinch);
        expect(pinch.defaultPrevented).toBe(true);
        const scroll = new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
        });
        panel.dispatchEvent(scroll);
        expect(scroll.defaultPrevented).toBe(false);
        stop();
        const after = new WheelEvent("wheel", {
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        panel.dispatchEvent(after);
        expect(after.defaultPrevented).toBe(false);
    });
    it("lets the field and the timeline see a pinch before cancelling it", () => {
        document.body.innerHTML = `<canvas id="field"></canvas>`;
        const stop = startTouchGestureGuard();
        const field = document.getElementById("field")!;
        let cancelledBeforeField = true;
        field.addEventListener("wheel", (event) => {
            cancelledBeforeField = event.defaultPrevented;
        });
        const pinch = new WheelEvent("wheel", {
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
        });
        field.dispatchEvent(pinch);
        stop();
        expect(cancelledBeforeField).toBe(false);
        expect(pinch.defaultPrevented).toBe(true);
    });
});
