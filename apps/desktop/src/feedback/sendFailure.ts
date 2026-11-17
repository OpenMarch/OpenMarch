/** What the report drawer says when sending fails (fork #801) */
import { NOT_SIGNED_IN } from "./reportUpload";

export interface SendFailure {
    readonly key: string;
    /** What went wrong, as the server or upload said it, for the unexpected cases */
    readonly detail?: string;
}

/** What to tell people when sending failed, by the API's status */
export function sendFailure(
    status: number | undefined,
    error: unknown,
): SendFailure {
    if (status === 409) return { key: "feedback.error.showChanged" };
    if (status === 429) return { key: "feedback.error.tooMany" };
    const message = error instanceof Error ? error.message : undefined;
    // The app's own "Not signed in" adds nothing; the server's reason does
    const detail = message && message !== NOT_SIGNED_IN ? message : undefined;
    return {
        key:
            status === 401
                ? "feedback.error.signedOut"
                : // The server answered, so it isn't the connection
                  status !== undefined
                  ? "feedback.error.refused"
                  : "feedback.error.failed",
        ...(detail ? { detail } : {}),
    };
}
