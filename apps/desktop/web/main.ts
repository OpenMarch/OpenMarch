/**
 * TEMPORARY (see README.md). The web build's entry: a start screen (a demo
 * show, the person's own `.dots` file, or a new show), then the real app.
 *
 * The app loads only once a show is open, after the preload has set up
 * `window.electron`, as Electron loads the preload before the page.
 * Leaving a show reloads the page back to this screen, because the app
 * expects a fresh window for each file.
 */
// Must run before any main-process module.
import "./shims/process";
import "./start.css";
import { DEMOS, type Demo } from "./demos";
import { downloadShow, openShow, registerHandlers, setShowName } from "./host";
import { loadSqlite } from "./shims/sqlite";

const start = document.getElementById("om-web-start")!;

/** The URL that opens the start screen (no show chosen). */
function startUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    url.searchParams.delete("new");
    return url;
}

function goToStart() {
    window.location.assign(startUrl());
}

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> = {},
    ...children: (Node | string)[]
) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
}

function option(title: string, detail: string, onClick: () => void) {
    return el(
        "button",
        { className: "omw-option", type: "button", onclick: onClick },
        el("strong", {}, title),
        el("span", {}, detail),
    );
}

function showMessage(text: string, isError = false) {
    start.replaceChildren(
        el(
            "div",
            { className: "omw-screen" },
            el(
                "div",
                { className: "omw-card" },
                el("p", { className: isError ? "omw-error" : "" }, text),
                ...(isError
                    ? [
                          option(
                              "Back to start",
                              "Choose another show",
                              goToStart,
                          ),
                      ]
                    : []),
            ),
        ),
    );
}

async function open(
    bytes: Uint8Array | null,
    name: string,
    query?: [string, string],
) {
    showMessage(bytes ? `Opening ${name}…` : "Creating a new show…");
    setShowName(name);
    const result = await openShow(bytes);
    if (!result.ok) {
        showMessage(result.message, true);
        return;
    }
    const url = startUrl();
    if (query) url.searchParams.set(...query);
    window.history.replaceState(null, "", url);
    await launchApp();
}

async function openDemo(demo: Demo) {
    showMessage(`Opening ${demo.name}…`);
    const response = await fetch(demo.file);
    if (!response.ok) {
        showMessage(`Couldn't load ${demo.name} (${response.status}).`, true);
        return;
    }
    await open(new Uint8Array(await response.arrayBuffer()), demo.name, [
        "demo",
        demo.id,
    ]);
}

async function openFile(file: File) {
    await open(new Uint8Array(await file.arrayBuffer()), file.name);
}

function chooseFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".dots";
    input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (file) void openFile(file);
    });
    input.click();
}

function renderStart() {
    const drop = option(
        "Open your own show",
        "Choose or drop a .dots file. It stays in your browser and is never uploaded.",
        chooseFile,
    );
    drop.classList.add("omw-drop");

    start.replaceChildren(
        el(
            "div",
            { className: "omw-screen" },
            el(
                "div",
                { className: "omw-card" },
                el("h1", {}, "OpenMarch test build"),
                el(
                    "p",
                    {},
                    "Pick a show to try this build with. Your changes last until you close or reload the tab; use Download to keep a copy.",
                ),
                el(
                    "div",
                    { className: "omw-options" },
                    ...DEMOS.map((demo) =>
                        option(
                            demo.name,
                            "Demo show",
                            () => void openDemo(demo),
                        ),
                    ),
                    option(
                        "New show",
                        "Start from an empty field",
                        () => void open(null, "New show", ["new", "1"]),
                    ),
                    drop,
                ),
            ),
        ),
    );
}

// A dropped .dots file opens from the start screen.
window.addEventListener("dragover", (event) => {
    if (start.childElementCount) event.preventDefault();
});
window.addEventListener("drop", (event) => {
    if (!start.childElementCount) return;
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file?.name.toLowerCase().endsWith(".dots")) void openFile(file);
});

function renderToolbar() {
    const toolbar = el(
        "div",
        { className: "omw-toolbar", role: "toolbar", ariaLabel: "Test build" },
        el(
            "button",
            {
                type: "button",
                onclick: downloadShow,
                title: "Save this show to your computer",
            },
            "Download .dots",
        ),
        el(
            "button",
            {
                type: "button",
                onclick: goToStart,
                title: "Choose another show; unsaved changes are lost",
            },
            "Start over",
        ),
    );
    document.body.append(toolbar);
}

async function launchApp() {
    start.replaceChildren();
    await import("@om-electron/preload/index");
    await import("@/main");
    renderToolbar();
}

async function boot() {
    showMessage("Loading…");
    await loadSqlite();
    registerHandlers({ onLeaveShow: goToStart });

    const params = new URLSearchParams(window.location.search);
    const demo = DEMOS.find((d) => d.id === params.get("demo"));
    if (demo) return openDemo(demo);
    if (params.has("new")) return open(null, "New show", ["new", "1"]);
    renderStart();
}

boot().catch((error) => {
    console.error(error);
    showMessage(error instanceof Error ? error.message : String(error), true);
});
