/**
 * TEMPORARY (see host.ts). Takes the place of `TitleBar` in the web preview
 * (a build alias in vite.config.mts): the show picker, Open a .dots file,
 * drag and drop, and mute. It also feeds the host the window's pages and
 * audio offset, read through the window's own queries.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    FolderOpenIcon,
    SpeakerHighIcon,
    SpeakerSlashIcon,
} from "@phosphor-icons/react";
import MarcherLogo from "@/components/MarcherLogo";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { workspaceSettingsQueryOptions } from "@/hooks/queries/useWorkspaceSettings";
import { DEMOS } from "./demos";
import { host } from "./host";
import { openDemo, openFile } from "./open";

function useHost<T>(read: () => T): T {
    return useSyncExternalStore((listener) => host.subscribe(listener), read);
}

export default function WebTitleBar() {
    const { pages } = useTimingObjects();
    const { data: workspace } = useQuery(workspaceSettingsQueryOptions());
    const showName = useHost(() => host.showName);
    const muted = useHost(() => host.muted);
    const hasAudio = useHost(() => host.hasAudio);
    const [error, setError] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        host.setPages(
            pages.map((page) => ({
                id: page.id,
                order: page.order,
                endMs: (page.timestamp + page.duration) * 1000,
            })),
        );
    }, [pages]);

    useEffect(() => {
        host.setAudioOffset(workspace?.audioOffsetSeconds ?? 0);
    }, [workspace?.audioOffsetSeconds]);

    useEffect(() => {
        document.title = `${showName} – 3D View preview`;
    }, [showName]);

    const run = (open: () => Promise<void>) => {
        setError(null);
        open().catch((e: unknown) => {
            console.error(e);
            setError(
                "Couldn't open that file. Is it a .dots show from OpenMarch?",
            );
        });
    };

    // Drop a .dots file anywhere on the page.
    useEffect(() => {
        let depth = 0;
        const hasFiles = (e: DragEvent) =>
            !!e.dataTransfer?.types.includes("Files");
        const onEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            depth++;
            setDragging(true);
        };
        const onLeave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            depth = Math.max(0, depth - 1);
            if (depth === 0) setDragging(false);
        };
        const onOver = (e: DragEvent) => {
            if (hasFiles(e)) e.preventDefault();
        };
        const onDrop = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth = 0;
            setDragging(false);
            const file = e.dataTransfer?.files[0];
            if (file) run(() => openFile(file));
        };
        window.addEventListener("dragenter", onEnter);
        window.addEventListener("dragleave", onLeave);
        window.addEventListener("dragover", onOver);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragenter", onEnter);
            window.removeEventListener("dragleave", onLeave);
            window.removeEventListener("dragover", onOver);
            window.removeEventListener("drop", onDrop);
        };
    }, []);

    const currentDemo = DEMOS.find((demo) => demo.name === showName);

    return (
        <>
            <div className="text-text border-stroke flex w-full flex-wrap items-center gap-12 border-b px-16 py-8">
                <MarcherLogo width={8} height={21} className="text-accent" />
                <p className="text-body min-w-0 truncate leading-none">
                    {showName || "Loading…"}
                </p>
                <span className="text-sub text-text/60 bg-fg-2 rounded-full px-8 py-2">
                    3D View preview, in development
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-8">
                    {error && (
                        <span className="text-sub text-red">{error}</span>
                    )}
                    <select
                        aria-label="Demo show"
                        className="text-sub bg-fg-1 border-stroke rounded-6 border px-8 py-4"
                        value={currentDemo?.id ?? ""}
                        onChange={(e) => {
                            const demo = DEMOS.find(
                                (d) => d.id === e.target.value,
                            );
                            if (demo) run(() => openDemo(demo));
                        }}
                    >
                        {!currentDemo && <option value="">Your file</option>}
                        {DEMOS.map((demo) => (
                            <option key={demo.id} value={demo.id}>
                                {demo.name}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="text-sub bg-fg-1 border-stroke rounded-6 hover:text-accent flex items-center gap-6 border px-8 py-4"
                        onClick={() => fileInput.current?.click()}
                        title="Open a .dots file, or drop one anywhere. It stays on your computer."
                    >
                        <FolderOpenIcon size={16} />
                        Open .dots
                    </button>
                    <input
                        ref={fileInput}
                        type="file"
                        accept=".dots"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) run(() => openFile(file));
                        }}
                    />
                    <button
                        type="button"
                        className="bg-fg-1 border-stroke rounded-6 hover:text-accent border p-4 disabled:opacity-40"
                        disabled={!hasAudio}
                        onClick={() => host.setMuted(!muted)}
                        aria-label={muted ? "Unmute music" : "Mute music"}
                        title={
                            hasAudio
                                ? muted
                                    ? "Unmute music"
                                    : "Mute music"
                                : "This show has no music"
                        }
                    >
                        {muted || !hasAudio ? (
                            <SpeakerSlashIcon size={16} />
                        ) : (
                            <SpeakerHighIcon size={16} />
                        )}
                    </button>
                </div>
            </div>
            {dragging && (
                <div className="bg-bg-1/80 text-h4 text-text pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
                    Drop a .dots file to view it. It stays on your computer.
                </div>
            )}
        </>
    );
}
