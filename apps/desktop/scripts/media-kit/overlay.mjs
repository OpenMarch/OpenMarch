// The input overlay for docs media: a pointer where the mouse is, a ring on each press, and
// the keys being held, drawn into the page so window captures include them (a capture of
// the app's window never shows the system pointer, and scripted input moves no real one).
//
// It listens to the page's own input events, so it shows exactly what the recording does:
// Playwright's mouse and keyboard reach the page as real input. Every fade is timed with
// performance.now(), which follows the recorder's virtual clock, so frames are the same on
// every run. Nothing here exists in the app itself; it's injected only while recording.

export const OVERLAY = `(() => {
    if (window.__docsOverlay) return;
    const MODS = { Control: "Ctrl", Shift: "Shift", Alt: "Alt", Meta: "Win" };
    const ORDER = ["Ctrl", "Alt", "Shift", "Win"];
    const NAMES = {
        " ": "Space", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
        Escape: "Esc", Delete: "Delete", Backspace: "Backspace", Enter: "Enter", Tab: "Tab",
        PageUp: "Page Up", PageDown: "Page Down", Home: "Home", End: "End",
    };
    const KEY_HOLD_MS = 900, FADE_MS = 250, RING_MS = 450;
    let enabled = false, root, pointer, caps, ringLayer;
    // The part of the window being recorded: the key caps sit at its bottom centre
    let frame = null;
    let x = -100, y = -100, buttons = 0, dragged = false, downAt = null;
    const held = new Set();
    let lastKey = null; // { text, upAt }
    const rings = [];

    function el(tag, style, parent) {
        const e = document.createElement(tag);
        Object.assign(e.style, style);
        parent?.appendChild(e);
        return e;
    }
    function build() {
        root = el("div", { position: "fixed", inset: "0", pointerEvents: "none",
            zIndex: "2147483647", overflow: "hidden" }, document.documentElement);
        root.setAttribute("data-docs-overlay", "");
        root.setAttribute("aria-hidden", "true");
        ringLayer = el("div", { position: "absolute", inset: "0" }, root);
        // The usual arrow pointer: white with a dark edge, readable on light and dark themes
        pointer = el("div", { position: "absolute", left: "0", top: "0", width: "22px",
            height: "28px", transformOrigin: "0 0", filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,.35))" }, root);
        pointer.innerHTML = '<svg width="22" height="28" viewBox="0 0 22 28"><path d="M1.5 1.5 L1.5 22.5 L7 17.3 L10.6 25.8 L14.3 24.2 L10.8 15.9 L18.4 15.9 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        // Held keys, as one cap in the app's own style, bottom centre
        caps = el("div", { position: "absolute", left: "50%", top: "0",
            transform: "translate(-50%, -100%)", display: "none", alignItems: "center", gap: "6px",
            padding: "8px 14px", borderRadius: "10px", background: "rgba(24,24,27,.88)",
            color: "#fafafa", font: "600 22px/1 system-ui, sans-serif", letterSpacing: ".01em",
            boxShadow: "0 4px 18px rgba(0,0,0,.28)", border: "1px solid rgba(255,255,255,.14)" }, root);
    }
    function keyText(e) {
        if (MODS[e.key]) return null;
        if (NAMES[e.key]) return NAMES[e.key];
        if (e.code && /^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
        if (e.code && /^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
        return e.key.length === 1 ? e.key.toUpperCase() : e.key;
    }
    function gesture() {
        if (!buttons) return null;
        const right = buttons & 2, middle = buttons & 4;
        const word = right ? "Right" : middle ? "Middle" : "";
        if (dragged) return word ? word + "-drag" : "Drag";
        return word ? word + "-click" : "Click";
    }
    function render() {
        if (!enabled) return;
        const now = performance.now();
        pointer.style.transform = "translate(" + (x - 1.5) + "px," + (y - 1.5) + "px)";
        // Rings: one per press, growing and fading out
        for (let i = rings.length - 1; i >= 0; i--) {
            const r = rings[i], t = (now - r.at) / RING_MS;
            if (t >= 1 && !r.holding) { r.node.remove(); rings.splice(i, 1); continue; }
            const k = r.holding ? Math.min(t, 0.35) : t;
            const size = 18 + 26 * k;
            Object.assign(r.node.style, { width: size + "px", height: size + "px",
                transform: "translate(" + (r.x - size / 2) + "px," + (r.y - size / 2) + "px)",
                opacity: String(r.holding ? 0.9 : 0.9 * (1 - t)) });
        }
        // While a button is down, a dot under the pointer shows it's held
        const keys = ORDER.filter((m) => held.has(m));
        let main = null, alpha = 1;
        if (lastKey) {
            const since = lastKey.upAt === null ? 0 : now - lastKey.upAt;
            if (since > KEY_HOLD_MS + FADE_MS) lastKey = null;
            else { main = lastKey.text; if (since > KEY_HOLD_MS) alpha = 1 - (since - KEY_HOLD_MS) / FADE_MS; }
        }
        const parts = [...keys];
        if (main) parts.push(main);
        const g = gesture();
        if (g) parts.push(g);
        if (!parts.length) { caps.style.display = "none"; return; }
        caps.style.display = "flex";
        const f = frame ?? { x: 0, y: 0, width: innerWidth, height: innerHeight };
        caps.style.left = f.x + f.width / 2 + "px";
        caps.style.top = f.y + f.height - Math.min(20, f.height * 0.05) + "px";
        caps.style.fontSize = Math.max(14, Math.min(22, f.width / 40)) + "px";
        caps.style.opacity = String(main && !keys.length && !g ? alpha : 1);
        caps.innerHTML = parts.map((p) => '<span>' + p.replace(/</g, "&lt;") + '</span>')
            .join('<span style="opacity:.45;font-weight:400">+</span>');
    }
    function loop() { render(); requestAnimationFrame(loop); }

    const opts = { capture: true, passive: true };
    addEventListener("pointermove", (e) => {
        x = e.clientX; y = e.clientY;
        if (buttons && downAt && Math.hypot(x - downAt.x, y - downAt.y) > 4) dragged = true;
        for (const r of rings) if (r.holding) { r.x = x; r.y = y; }
    }, opts);
    addEventListener("pointerdown", (e) => {
        x = e.clientX; y = e.clientY; buttons = e.buttons || 1; dragged = false;
        downAt = { x, y };
        if (!enabled) return;
        const node = el("div", { position: "absolute", left: "0", top: "0", borderRadius: "50%",
            border: "3px solid " + (e.button === 2 ? "#a855f7" : "#f59e0b"),
            background: "rgba(245,158,11,.18)" }, ringLayer);
        rings.push({ node, x, y, at: performance.now(), holding: true });
    }, opts);
    addEventListener("pointerup", (e) => {
        buttons = e.buttons; downAt = null;
        for (const r of rings) if (r.holding) { r.holding = false; r.at = performance.now() - RING_MS * 0.35; }
        if (!buttons) dragged = false;
    }, opts);
    addEventListener("keydown", (e) => {
        if (MODS[e.key]) held.add(MODS[e.key]);
        const t = keyText(e);
        if (t) lastKey = { text: t, upAt: null };
    }, opts);
    addEventListener("keyup", (e) => {
        if (MODS[e.key]) held.delete(MODS[e.key]);
        else if (lastKey && lastKey.upAt === null) lastKey.upAt = performance.now();
    }, opts);
    addEventListener("blur", () => { held.clear(); }, opts);

    window.__docsOverlay = {
        enable() {
            if (!root) build();
            enabled = true; root.style.display = "block";
            requestAnimationFrame(loop);
        },
        disable() { enabled = false; if (root) root.style.display = "none"; },
        /** The recorded part of the window (window points), so the key caps stay inside it. */
        setFrame(rect) { frame = rect; render(); },
        /** Put the pointer somewhere without moving the mouse (a still's starting point). */
        place(px, py) { x = px; y = py; render(); },
        /** Show keys in the cap without pressing them (a still of a held shortcut). */
        show(text) { lastKey = text ? { text, upAt: null } : null; render(); },
    };
})()`;
