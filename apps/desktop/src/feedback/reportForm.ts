/**
 * The bug and feedback report form (fork #801; fields and limits from
 * OpenMarch/om-online#91): which questions each kind of report asks, what
 * must be filled in, and the report as it's sent.
 */
export type ReportType = "broken" | "feature" | "feedback";

export const REPORT_TYPES: readonly ReportType[] = [
    "broken",
    "feature",
    "feedback",
];

export type AnswerKey =
    | "whatWentWrong"
    | "expected"
    | "steps"
    | "feature"
    | "ideas"
    | "feedback";

export interface Question {
    readonly key: AnswerKey;
    readonly required: boolean;
}

export const QUESTIONS: Readonly<Record<ReportType, readonly Question[]>> = {
    broken: [
        { key: "whatWentWrong", required: true },
        { key: "expected", required: true },
        { key: "steps", required: false },
    ],
    feature: [
        { key: "feature", required: true },
        { key: "ideas", required: false },
    ],
    feedback: [{ key: "feedback", required: true }],
};

export const TITLE_MAX_LENGTH = 120;
/** Recording limits from #91 */
export const MAX_RECORDING_SECONDS = 5 * 60;
export const MAX_RECORDING_BYTES = 500 * 1024 * 1024;
export const MAX_SHOW_FILE_BYTES = 1024 * 1024 * 1024;

export interface ReportDraft {
    readonly type: ReportType | null;
    readonly title: string;
    readonly answers: Readonly<Partial<Record<AnswerKey, string>>>;
    readonly sendShowFile: boolean;
    readonly includeMusic: boolean;
    readonly consent: {
        readonly videoPublic: boolean;
        readonly showFilePublic: boolean;
        readonly creditByName: boolean;
    };
}

export const EMPTY_DRAFT: ReportDraft = {
    type: null,
    title: "",
    answers: {},
    sendShowFile: true,
    includeMusic: false,
    consent: { videoPublic: false, showFilePublic: false, creditByName: false },
};

export type DraftProblem = "type" | "title" | AnswerKey;

/** What still has to be filled in before the report can be sent; empty when it's ready. */
export function draftProblems(draft: ReportDraft): DraftProblem[] {
    if (!draft.type) return ["type"];
    const problems: DraftProblem[] = [];
    if (!draft.title.trim()) problems.push("title");
    for (const q of QUESTIONS[draft.type])
        if (q.required && !draft.answers[q.key]?.trim()) problems.push(q.key);
    return problems;
}

export interface ReportContext {
    readonly appVersion: string;
    readonly platform: string;
    readonly channel: "desktop" | "web";
    readonly sentryEventId?: string;
    readonly posthogSessionId?: string;
}

/** Each answer's name in the API (om-online `POST /api/editor/v1/reports`) */
export const API_ANSWER_KEYS: Readonly<Record<AnswerKey, string>> = {
    whatWentWrong: "what_went_wrong",
    expected: "expected",
    steps: "steps_to_reproduce",
    feature: "feature",
    ideas: "ideas",
    feedback: "message",
};

/** The API's `report` object, without `files` (the main process adds those after uploading). */
export interface ReportPayload {
    readonly kind: ReportType;
    readonly channel: "desktop" | "web";
    readonly title: string;
    readonly answers: Record<string, string>;
    readonly context: {
        readonly app_version: string;
        readonly platform: string;
        readonly sentry_event_id?: string;
        readonly posthog_session_id?: string;
    };
    readonly consent: {
        readonly video_public: boolean;
        readonly show_file_public: boolean;
        readonly credit_name: boolean;
    };
}

/**
 * Builds what's sent from a ready draft. Only the chosen type's answers go,
 * trimmed, so switching type halfway doesn't send stale text.
 */
export function buildPayload(
    draft: ReportDraft,
    context: ReportContext,
    { hasVideo, hasShowFile }: { hasVideo: boolean; hasShowFile: boolean },
): ReportPayload {
    if (draftProblems(draft).length > 0 || !draft.type)
        throw new Error("The report isn't ready to send");
    const answers: Record<string, string> = {};
    for (const q of QUESTIONS[draft.type]) {
        const value = draft.answers[q.key]?.trim();
        if (value) answers[API_ANSWER_KEYS[q.key]] = value;
    }
    return {
        kind: draft.type,
        channel: context.channel,
        title: draft.title.trim().slice(0, TITLE_MAX_LENGTH),
        answers,
        context: {
            app_version: context.appVersion,
            platform: context.platform,
            ...(context.sentryEventId
                ? { sentry_event_id: context.sentryEventId }
                : {}),
            ...(context.posthogSessionId
                ? { posthog_session_id: context.posthogSessionId }
                : {}),
        },
        consent: {
            video_public: hasVideo && draft.consent.videoPublic,
            show_file_public: hasShowFile && draft.consent.showFilePublic,
            credit_name: draft.consent.creditByName,
        },
    };
}

/** A GitHub "new bug" link with version and OS filled in, for people who won't sign in. */
export function githubBugReportUrl(context: ReportContext): string {
    const params = new URLSearchParams({
        template: "bug-template.yaml",
        version: context.appVersion,
    });
    return `https://github.com/OpenMarch/OpenMarch/issues/new?${params.toString()}`;
}

export const DISCORD_URL = "https://discord.gg/eTsQ98uZzq";
