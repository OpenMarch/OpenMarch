import tolgee from "../../src/global/singletons/Tolgee";
import { isWorkerErrorKey } from "../protocol";

/**
 * A worker error's message in the app's language: one of `WORKER_ERRORS` is a key, translated
 * here; any other message stays as the worker wrote it.
 */
export const workerErrorText = (message: string): string =>
    isWorkerErrorKey(message) ? tolgee.t(message) : message;
