/**
 * The report drawer's state (fork #801): "Report a bug or send feedback"
 * opens a drawer over the editor (`ReportDrawer.tsx`), in the desktop app
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
const MICROPHONE_KEY = "openmarch:reportMicrophone";
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

/** Recording with the microphone is on until someone turns it off */
function savedMicrophone(): boolean {
    try {
        return localStorage.getItem(MICROPHONE_KEY) !== "off";
    } catch {
        return true;
    }
}

export const useReportDrawerStore = create<{
    /** The form is open (shown, or tucked away behind its tab) */
    readonly open: boolean;
    /** Tucked away behind its tab, with what's typed kept */
    readonly collapsed: boolean;
    readonly width: number;
    /** A screen recording under way; the drawer steps aside meanwhile */
    readonly recording: RecordingInProgress | null;
    /** Something typed or recorded that closing would throw away */
    readonly dirty: boolean;
    /** A report is being sent; closing waits for it */
    readonly sending: boolean;
    /** Record with the microphone; remembered on this computer */
    readonly microphone: boolean;
    readonly show: () => void;
    readonly close: () => void;
    readonly setCollapsed: (collapsed: boolean) => void;
    readonly setWidth: (width: number) => void;
    readonly setRecording: (recording: RecordingInProgress | null) => void;
    readonly setDirty: (dirty: boolean) => void;
    readonly setSending: (sending: boolean) => void;
    readonly setMicrophone: (microphone: boolean) => void;
}>((set) => ({
    open: false,
    collapsed: false,
    width: savedWidth(),
    recording: null,
    dirty: false,
    sending: false,
    microphone: savedMicrophone(),
    show: () => set({ open: true, collapsed: false }),
    close: () => set({ open: false, collapsed: false, dirty: false }),
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
    setDirty: (dirty) => set({ dirty }),
    setSending: (sending) => set({ sending }),
    setMicrophone: (microphone) => {
        try {
            localStorage.setItem(MICROPHONE_KEY, microphone ? "on" : "off");
        } catch {
            // See savedWidth
        }
        set({ microphone });
    },
}));

export const openReport = () => useReportDrawerStore.getState().show();
