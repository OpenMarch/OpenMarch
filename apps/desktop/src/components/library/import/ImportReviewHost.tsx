/**
 * A temporary full-window host for the import review (package C1.10).
 *
 * TODO(Visuals mode): the review belongs in Visuals mode (owner, Q60): the
 * Library side panel becomes `ImportPanel` and the Visuals mode stage shows
 * `ImportPreviewStage`, both reading the same `createImportReview` store.
 * Visuals mode arrives with ADR 0004's cue work, so until then this host
 * lays the two out the same way over the editor, opened by Import… in the
 * Assets sidebar tab and rendered by `AssetsHost`. Moving them means
 * mounting the two components there and deleting this file and
 * `ImportToLibraryButton`.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { T } from "@tolgee/react";
import { useStore } from "zustand";
import ImportPanel from "./ImportPanel";
import ImportPreviewStage from "./ImportPreviewStage";
import type { ImportReviewStore } from "./importReview";

export default function ImportReviewHost({
    store,
}: {
    store: ImportReviewStore;
}) {
    const phase = useStore(store, (s) => s.phase);
    const hasSession = useStore(store, (s) => s.session !== null);
    const top = useTitleBarBottom();

    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            const s = store.getState();
            if (e.key !== "Escape" || s.model?.pickingGrip) return;
            if (s.phase === "committing" || s.phase === "picking") return;
            s.close();
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, [store]);

    // While the file dialog is open, show nothing over the editor.
    if (phase === "closed" || (phase === "picking" && !hasSession)) {
        return null;
    }

    return createPortal(
        <div
            className="bg-bg-1 text-text fixed inset-x-0 bottom-0 z-50 flex gap-8 p-8 font-sans"
            style={{ top }}
            data-testid="import-review-host"
            role="dialog"
            aria-modal="true"
        >
            <div className="rounded-6 border-stroke bg-fg-1 relative flex min-w-0 flex-1 flex-col border">
                <div className="text-sub text-text-subtitle pointer-events-none absolute top-8 left-10 z-10 font-mono uppercase">
                    <T keyName="library.import.stage.label" />
                </div>
                <div className="flex min-h-0 flex-1 pt-28">
                    <ImportPreviewStage store={store} />
                </div>
            </div>
            <div className="rounded-6 border-stroke bg-fg-1 flex w-[380px] min-w-0 shrink-0 flex-col border">
                <ImportPanel store={store} />
            </div>
        </div>,
        document.body,
    );
}

/**
 * Where the editor's title bar ends, so the review starts below it: the
 * window buttons and the drag region stay clear. The title bar sizes to its
 * content, so it's measured, and again when the window resizes.
 */
function useTitleBarBottom(): number {
    const [bottom, setBottom] = useState(0);
    useLayoutEffect(() => {
        const bar = document.querySelector(".main-app-titlebar");
        if (!bar) return;
        const measure = () => setBottom(bar.getBoundingClientRect().bottom);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(bar);
        return () => observer.disconnect();
    }, []);
    return bottom;
}
