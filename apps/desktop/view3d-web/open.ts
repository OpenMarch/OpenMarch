/** TEMPORARY (see host.ts). Opening a demo or a file the viewer chose. */
import type { Demo } from "./demos";
import { host } from "./host";

export async function openDemo(demo: Demo) {
    const response = await fetch(demo.file);
    if (!response.ok) throw new Error(`${demo.file}: ${response.status}`);
    await host.open(new Uint8Array(await response.arrayBuffer()), demo.name);
    const url = new URL(window.location.href);
    url.searchParams.set("demo", demo.id);
    window.history.replaceState(null, "", url);
}

/** Reads the file in the browser; it is never uploaded. */
export async function openFile(file: File) {
    await host.open(
        new Uint8Array(await file.arrayBuffer()),
        file.name.replace(/\.dots$/i, ""),
    );
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.history.replaceState(null, "", url);
}
