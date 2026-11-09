// What every recorded window gets before the page's own scripts: a virtual clock, and a
// software renderer reported as a GPU. Shared by the What's new clips and the docs media.
import fs from "node:fs";
import path from "node:path";
import { OVERLAY } from "./overlay.mjs";

// - A virtual clock. While set, performance.now() and every AudioContext's currentTime follow
//   it instead of real time. The app's playback reads its time from the AudioContext, and the
//   3D View extrapolates from performance.now(), so stepping this clock in every window moves
//   the show by exactly that much, and animations step with it.
// - The 3D View on High quality. On Auto (the default) it drops to Low once if frames are slow,
//   which in software drawing happens on some runs and not others (#766).
// - The field draws a simpler view when WebGL runs in software (SwiftShader); recordings should
//   show the full view, so a software renderer is reported as a GPU and its notice is hidden.
export const PAGE_SETUP = `(() => {
    if (window.__whatsNewClock) return;
    const realNow = performance.now.bind(performance);
    const origin = performance.timeOrigin;
    let wallMs = null;
    window.__whatsNewClock = {
        set(ms) { wallMs = ms; },
        release() { wallMs = null; },
    };
    performance.now = () => (wallMs === null ? realNow() : wallMs - origin);
    const time = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "currentTime");
    const anchors = new WeakMap();
    Object.defineProperty(BaseAudioContext.prototype, "currentTime", {
        configurable: true,
        get() {
            const real = time.get.call(this);
            if (wallMs === null) { anchors.delete(this); return real; }
            let anchor = anchors.get(this);
            if (!anchor) { anchor = { real, wall: wallMs }; anchors.set(this, anchor); }
            return anchor.real + (wallMs - anchor.wall) / 1000;
        },
    });
    try {
        if (localStorage.getItem("view3d.quality") === null)
            localStorage.setItem("view3d.quality", "high");
    } catch {}
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
        const get = C.prototype.getParameter;
        C.prototype.getParameter = function (p) {
            const v = get.call(this, p);
            return typeof v === "string" && /swiftshader|llvmpipe/i.test(v) ? "Recording GPU" : v;
        };
    }
})()`;

/**
 * Writes the preload that sets every window up, into `dir`; returns its path. With
 * `overlay`, the input overlay (pointer, clicks, keys) is installed too, switched off until
 * a recording turns it on with `window.__docsOverlay.enable()`.
 */
export function writePreload(dir, { overlay = false } = {}) {
    const file = path.join(dir, "page-setup.cjs");
    const scripts = [PAGE_SETUP, ...(overlay ? [OVERLAY] : [])];
    fs.writeFileSync(
        file,
        `const { webFrame } = require("electron");
${scripts.map((s) => `webFrame.executeJavaScript(${JSON.stringify(s)});`).join("\n")}
webFrame.insertCSS('[data-testid="view3d-quality-notice"] { display: none !important; }');`,
    );
    return file;
}
