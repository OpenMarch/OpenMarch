/**
 * The report drawer's state (fork #801): "Report a bug or send feedback"
 * opens a drawer beside the editor (`ReportDrawer.tsx`), in the desktop app
 * and the web editor alike.
 */
import { create } from "zustand";
import { isSignInEnabled } from "@/global/auth/constants";
import { isWebBuild } from "@/utilities/webBuild";
import type { RecordingInProgress } from "./ReportForm";

/**
 * Whether this build has the report form. Web builds that can't sign in
 * (example builds, a branch's own address) keep the feedback guide instead.
 */
export const canSendReports = !isWebBuild || isSignInEnabled;

const WIDTH_KEY = "openmarch:reportDrawerWidth";
export const DEFAULT_DRAWER_WIDTH = 440;
export const MIN_DRAWER_WIDTH = 360;
export const MAX_DRAWER_WIDTH = 720;

export const clampDrawerWidth = (width: number, windowWidth: number) =>
    Math.round(
        Math.max(
            MIN_DRAWER_WIDTH,
            Math.min(width, MAX_DRAWER_WIDTH, windowWidth * 0.6),
        ),
    );

function savedWidth(): number {
    try {
        const saved = Number(localStorage.getItem(WIDTH_KEY));
        if (saved > 0) return saved;
    } catch {
        // Storage blocked: the default for this page
    }
    return DEFAULT_DRAWER_WIDTH;
}

export const useReportDrawerStore = create<{
    /** The form is open (shown, or tucked away behind its tab) */
    readonly open: boolean;
    /** Tucked away behind its tab, with what's typed kept */
    readonly collapsed: boolean;
    readonly width: number;
    /** A screen recording under way; the drawer steps aside meanwhile */
    readonly recording: RecordingInProgress | null;
    readonly show: () => void;
    readonly close: () => void;
    readonly setCollapsed: (collapsed: boolean) => void;
    readonly setWidth: (width: number) => void;
    readonly setRecording: (recording: RecordingInProgress | null) => void;
}>((set) => ({
    open: false,
    collapsed: false,
    width: savedWidth(),
    recording: null,
    show: () => set({ open: true, collapsed: false }),
    close: () => set({ open: false, collapsed: false }),
    setCollapsed: (collapsed) => set({ collapsed }),
    setWidth: (width) => {
        try {
            localStorage.setItem(WIDTH_KEY, String(width));
        } catch {
            // See savedWidth
        }
        set({ width });
    },
    setRecording: (recording) => set({ recording }),
}));

export const openReport = () => useReportDrawerStore.getState().show();
