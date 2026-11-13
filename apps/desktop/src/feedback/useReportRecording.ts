/**
 * Records the editor for a bug report (fork #801). In the desktop app the
 * main process answers the screen request with the editor window itself
 * (`electron/main/reports.ts`), so nothing else on screen is captured and there is
 * no picker. In the web editor the browser's picker offers this tab first.
 * The microphone is optional and mixed in as the audio track.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { isWebBuild } from "@/utilities/webBuild";
import { MAX_RECORDING_SECONDS } from "./reportDraft";

/**
 * In a browser the person picks what to share. Offer this tab first and
 * leave out whole screens (Chromium; other browsers ignore these).
 */
const WEB_PICKER_HINTS = {
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    monitorTypeSurfaces: "exclude",
    surfaceSwitching: "exclude",
};

const DISPLAY_OPTIONS = {
    video: { frameRate: 30 },
    audio: false,
    ...(isWebBuild ? WEB_PICKER_HINTS : {}),
} as DisplayMediaStreamOptions;

/** Stop by this size; 5 minutes at 2.5 megabits a second is about 95 MB, so this is only a safety net. */
const RECORDING_STOP_BYTES = 200 * 1024 * 1024;

export type RecordingState =
    | { readonly status: "idle" }
    | { readonly status: "recording"; readonly startedAt: number }
    | {
          readonly status: "done";
          readonly blob: Blob;
          readonly seconds: number;
      }
    | {
          readonly status: "failed";
          readonly reason: "denied" | "microphone" | "unsupported";
      };

/** MP4 where Chromium can write it (plays everywhere), WebM otherwise. */
export function pickMimeType(
    isSupported: (type: string) => boolean = (type) =>
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported(type),
): string | undefined {
    return [
        "video/mp4;codecs=avc1,opus",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm",
    ].find(isSupported);
}

/** The microphone, or null when it's refused or missing */
const microphoneStream = () =>
    navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);

// eslint-disable-next-line max-lines-per-function -- one recorder, start to stop
export function useReportRecording() {
    const [state, setState] = useState<RecordingState>({ status: "idle" });
    const recorder = useRef<MediaRecorder | null>(null);
    const streams = useRef<MediaStream[]>([]);
    const limit = useRef<ReturnType<typeof setTimeout> | null>(null);

    const release = useCallback(() => {
        if (limit.current) clearTimeout(limit.current);
        limit.current = null;
        streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
        streams.current = [];
    }, []);

    const stop = useCallback(() => {
        if (recorder.current?.state === "recording") recorder.current.stop();
    }, []);

    const start = useCallback(
        async ({ microphone }: { microphone: boolean }) => {
            const mimeType = pickMimeType();
            if (!navigator.mediaDevices?.getDisplayMedia || !mimeType) {
                setState({ status: "failed", reason: "unsupported" });
                return;
            }
            try {
                const screen =
                    await navigator.mediaDevices.getDisplayMedia(
                        DISPLAY_OPTIONS,
                    );
                streams.current.push(screen);
                const tracks: MediaStreamTrack[] = [...screen.getVideoTracks()];
                if (microphone) {
                    const mic = await microphoneStream();
                    // The screen was allowed but not the microphone: say which
                    if (!mic) {
                        release();
                        setState({ status: "failed", reason: "microphone" });
                        return;
                    }
                    streams.current.push(mic);
                    tracks.push(...mic.getAudioTracks());
                }
                const chunks: Blob[] = [];
                let bytes = 0;
                const startedAt = Date.now();
                const rec = new MediaRecorder(new MediaStream(tracks), {
                    mimeType,
                    videoBitsPerSecond: 2_500_000,
                });
                rec.ondataavailable = (event) => {
                    if (event.data.size === 0) return;
                    chunks.push(event.data);
                    bytes += event.data.size;
                    // Well under the server's cap: the clip crosses to the main process in one message
                    if (bytes >= RECORDING_STOP_BYTES) stop();
                };
                rec.onstop = () => {
                    release();
                    setState({
                        status: "done",
                        blob: new Blob(chunks, { type: mimeType }),
                        // The encoder can finish a moment after the 5-minute stop
                        seconds: Math.min(
                            MAX_RECORDING_SECONDS,
                            Math.round((Date.now() - startedAt) / 1000),
                        ),
                    });
                };
                // Ending the share from outside (window closed) ends the recording
                screen.getVideoTracks()[0]?.addEventListener("ended", stop);
                recorder.current = rec;
                rec.start(1000);
                limit.current = setTimeout(stop, MAX_RECORDING_SECONDS * 1000);
                setState({ status: "recording", startedAt });
            } catch {
                release();
                setState({ status: "failed", reason: "denied" });
            }
        },
        [release, stop],
    );

    const discard = useCallback(() => {
        // Stopping fires onstop later; don't let it bring the clip back
        if (recorder.current) recorder.current.onstop = null;
        stop();
        release();
        setState({ status: "idle" });
    }, [release, stop]);

    useEffect(() => release, [release]);

    return { state, start, stop, discard };
}
