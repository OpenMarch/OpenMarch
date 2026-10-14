/**
 * Artwork import (package C1.8): main process only, no IPC (package C1.9).
 */
export * from "./pipeline";
export * from "./sidecar";
export type { ArtworkFormat } from "./formats";
export type { PdfDocument, PdfPageInfo, PdfRenderer } from "./pdf";
export {
    closeAllPdfRenderers,
    createElectronPdfRenderer,
    isPdfRendererWindow,
    livePdfRendererCount,
    type ElectronPdfRendererOptions,
} from "./electron-pdf-renderer";
