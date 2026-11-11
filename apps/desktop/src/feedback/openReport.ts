import { isSignInEnabled } from "@/global/auth/constants";
import { isWebBuild } from "@/utilities/webBuild";

/**
 * The web editor shows the report form in a sheet over the app
 * (`WebReportSheet.tsx`), where the desktop app opens a window. The page's
 * "report:open" handler (`web/renderer/report.ts`) asks for it with this event.
 */
export const OPEN_REPORT_EVENT = "openmarch:open-report";

export function requestOpenReport(target: EventTarget = window) {
    target.dispatchEvent(new Event(OPEN_REPORT_EVENT));
}

/**
 * Whether this build has the report form. Web builds that can't sign in
 * (example builds, a branch's own address) keep the feedback guide instead.
 */
export const canSendReports = !isWebBuild || isSignInEnabled;
