/**
 * The report form inside the #report window (fork #801): what kind of report,
 * a title, that kind's questions, what to attach, and what may be made public.
 */
import { useEffect, useState, type ReactNode } from "react";
import { T, useTranslate } from "@tolgee/react";
import { toast } from "sonner";
import {
    Button,
    Checkbox,
    Input,
    RadioGroup,
    RadioGroupItem,
    Switch,
    TextArea,
} from "@openmarch/ui";
import clsx from "clsx";
import {
    FileIcon,
    MusicNotesIcon,
    ShieldCheckIcon,
} from "@phosphor-icons/react";
import {
    buildPayload,
    draftProblems,
    EMPTY_DRAFT,
    QUESTIONS,
    REPORT_TYPES,
    TITLE_MAX_LENGTH,
    type AnswerKey,
    type ReportContext,
    type ReportDraft,
} from "./reportForm";
import { useReportRecording } from "./useReportRecording";
import { ReportsNotConnectedError, submitReport } from "./reportsApi";

interface ReportFormProps {
    context: ReportContext;
    onSent: () => void;
}

// eslint-disable-next-line max-lines-per-function
export default function ReportForm({ context, onSent }: ReportFormProps) {
    const { t } = useTranslate();
    const [draft, setDraft] = useState<ReportDraft>(EMPTY_DRAFT);
    const [sending, setSending] = useState(false);
    const [showFileName, setShowFileName] = useState<string | null>(null);
    const [microphone, setMicrophone] = useState(false);
    const recording = useReportRecording();
    const problems = draftProblems(draft);

    // Whether a show is open decides whether "Send my show file" is offered
    useEffect(() => {
        void window.electron.report
            .showInfo()
            .then((info) => setShowFileName(info?.fileName ?? null))
            .catch(() => setShowFileName(null));
    }, []);

    const update = (change: Partial<ReportDraft>) =>
        setDraft((d) => ({ ...d, ...change }));
    const setAnswer = (key: AnswerKey, value: string) =>
        setDraft((d) => ({ ...d, answers: { ...d.answers, [key]: value } }));
    const setConsent = (key: keyof ReportDraft["consent"], value: boolean) =>
        setDraft((d) => ({ ...d, consent: { ...d.consent, [key]: value } }));

    const hasVideo = recording.state.status === "done";
    const sendsShowFile = draft.sendShowFile && showFileName !== null;

    async function send() {
        setSending(true);
        try {
            const payload = buildPayload(draft, context, {
                hasVideo,
                hasShowFile: sendsShowFile,
            });
            const [copy, diagnostics] = await Promise.all([
                sendsShowFile
                    ? window.electron.report.showCopy({
                          includeAudio: draft.includeMusic,
                      })
                    : Promise.resolve(null),
                window.electron.report.diagnostics(),
            ]);
            await submitReport(payload, {
                showFilePath: copy?.path,
                recording:
                    recording.state.status === "done"
                        ? recording.state.blob
                        : undefined,
                diagnostics,
            });
            onSent();
        } catch (error) {
            toast.error(
                error instanceof ReportsNotConnectedError
                    ? t("feedback.error.notConnected")
                    : t("feedback.error.failed"),
            );
        } finally {
            setSending(false);
        }
    }

    return (
        <form
            className="mx-auto flex max-w-[36rem] flex-col gap-24 px-24 py-24"
            onSubmit={(e) => {
                e.preventDefault();
                if (problems.length === 0 && !sending) void send();
            }}
        >
            <h1 className="text-h4">
                <T keyName="feedback.window.title" />
            </h1>

            <Field label={<T keyName="feedback.type.label" />}>
                <RadioGroup
                    value={draft.type ?? ""}
                    onValueChange={(value) =>
                        update({ type: value as ReportDraft["type"] })
                    }
                    className="flex flex-col gap-8"
                >
                    {REPORT_TYPES.map((type) => (
                        <label
                            key={type}
                            className="rounded-6 border-stroke bg-fg-1 has-[button[data-state=checked]]:border-accent flex cursor-pointer items-center gap-12 border p-12"
                        >
                            <RadioGroupItem value={type} />
                            <span className="flex flex-col">
                                <span className="text-body">
                                    <T keyName={`feedback.type.${type}`} />
                                </span>
                                <span className="text-sub text-text-subtitle">
                                    <T keyName={`feedback.type.${type}.hint`} />
                                </span>
                            </span>
                        </label>
                    ))}
                </RadioGroup>
            </Field>

            {draft.type && (
                <>
                    <Field
                        label={<T keyName="feedback.title.label" />}
                        htmlFor="report-title"
                    >
                        <Input
                            id="report-title"
                            maxLength={TITLE_MAX_LENGTH}
                            value={draft.title}
                            placeholder={t("feedback.title.placeholder")}
                            onChange={(e) => update({ title: e.target.value })}
                        />
                    </Field>

                    {QUESTIONS[draft.type].map((q) => (
                        <Field
                            key={q.key}
                            htmlFor={`report-${q.key}`}
                            label={
                                <>
                                    <T keyName={`feedback.question.${q.key}`} />
                                    {!q.required && (
                                        <span className="text-text-subtitle">
                                            {" "}
                                            <T keyName="feedback.optional" />
                                        </span>
                                    )}
                                </>
                            }
                        >
                            <TextArea
                                id={`report-${q.key}`}
                                rows={q.key === "steps" ? 4 : 3}
                                value={draft.answers[q.key] ?? ""}
                                placeholder={t(
                                    `feedback.question.${q.key}.placeholder`,
                                )}
                                onChange={(e) =>
                                    setAnswer(q.key, e.target.value)
                                }
                            />
                        </Field>
                    ))}

                    <Field label={<T keyName="feedback.attach.label" />}>
                        <div className="flex flex-col gap-12">
                            {showFileName !== null ? (
                                <ShowFileCard
                                    fileName={showFileName}
                                    send={draft.sendShowFile}
                                    onSend={(v) => update({ sendShowFile: v })}
                                    includeMusic={draft.includeMusic}
                                    onIncludeMusic={(v) =>
                                        update({ includeMusic: v })
                                    }
                                />
                            ) : (
                                <p className="text-sub text-text-subtitle">
                                    <T keyName="feedback.attach.noShow" />
                                </p>
                            )}
                            <RecordingControls
                                recording={recording}
                                microphone={microphone}
                                onMicrophone={setMicrophone}
                            />
                            <p className="text-sub text-text-subtitle">
                                <T keyName="feedback.attach.diagnostics" />
                            </p>
                        </div>
                    </Field>

                    <Field label={<T keyName="feedback.public.label" />}>
                        <div className="flex flex-col gap-12">
                            <p className="text-sub text-text-subtitle">
                                <T keyName="feedback.public.notice" />
                            </p>
                            {hasVideo && (
                                <CheckRow
                                    id="report-video-public"
                                    checked={draft.consent.videoPublic}
                                    onChange={(v) =>
                                        setConsent("videoPublic", v)
                                    }
                                    label={
                                        <T keyName="feedback.public.video" />
                                    }
                                />
                            )}
                            {sendsShowFile && (
                                <CheckRow
                                    id="report-show-public"
                                    checked={draft.consent.showFilePublic}
                                    onChange={(v) =>
                                        setConsent("showFilePublic", v)
                                    }
                                    label={
                                        <T keyName="feedback.public.showFile" />
                                    }
                                />
                            )}
                            <CheckRow
                                id="report-credit"
                                checked={draft.consent.creditByName}
                                onChange={(v) => setConsent("creditByName", v)}
                                label={<T keyName="feedback.public.credit" />}
                            />
                        </div>
                    </Field>

                    <div className="flex flex-col gap-12">
                        <Button
                            type="submit"
                            className="self-start"
                            disabled={
                                problems.length > 0 ||
                                sending ||
                                recording.state.status === "recording"
                            }
                        >
                            <T
                                keyName={
                                    sending
                                        ? "feedback.sending"
                                        : "feedback.send"
                                }
                            />
                        </Button>
                        <p className="text-sub text-text-subtitle">
                            <T keyName="feedback.retention" />
                        </p>
                    </div>
                </>
            )}
        </form>
    );
}

function Field({
    label,
    htmlFor,
    children,
}: {
    label: ReactNode;
    htmlFor?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-8">
            {htmlFor ? (
                <label htmlFor={htmlFor} className="text-body font-medium">
                    {label}
                </label>
            ) : (
                <span className="text-body font-medium">{label}</span>
            )}
            {children}
        </div>
    );
}

function CheckRow({
    id,
    checked,
    onChange,
    label,
    hint,
}: {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: ReactNode;
    hint?: ReactNode;
}) {
    return (
        <div className="flex items-start gap-12">
            <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(v) => onChange(v === true)}
            />
            <label htmlFor={id} className="flex flex-col pt-4">
                <span className="text-body">{label}</span>
                {hint && (
                    <span className="text-sub text-text-subtitle">{hint}</span>
                )}
            </label>
        </div>
    );
}

/** The show copy: whether to send it, which file, and whether its music goes too. */
function ShowFileCard({
    fileName,
    send,
    onSend,
    includeMusic,
    onIncludeMusic,
}: {
    fileName: string;
    send: boolean;
    onSend: (send: boolean) => void;
    includeMusic: boolean;
    onIncludeMusic: (include: boolean) => void;
}) {
    return (
        <div
            className={clsx(
                "rounded-6 border-stroke bg-fg-1 flex flex-col border",
                send && "border-accent/60",
            )}
        >
            <div className="flex items-center gap-12 p-12">
                <Checkbox
                    id="report-show-file"
                    checked={send}
                    onCheckedChange={(v) => onSend(v === true)}
                />
                <label
                    htmlFor="report-show-file"
                    className="flex min-w-0 flex-1 cursor-pointer flex-col gap-2"
                >
                    <span className="text-body">
                        <T keyName="feedback.attach.showFile" />
                    </span>
                    <span
                        className={clsx(
                            "flex min-w-0 items-center gap-6",
                            !send && "opacity-50",
                        )}
                    >
                        <FileIcon size={18} className="text-accent shrink-0" />
                        <span className="text-body truncate font-mono font-medium">
                            {fileName}
                        </span>
                    </span>
                </label>
            </div>
            {send && (
                <div className="border-stroke text-sub flex flex-col gap-8 border-t px-12 py-10 pl-52">
                    <span className="text-text-subtitle flex items-center gap-6">
                        <ShieldCheckIcon size={16} className="shrink-0" />
                        <T keyName="feedback.attach.showFile.scrubbed" />
                    </span>
                    <div className="flex items-center gap-6">
                        <MusicNotesIcon
                            size={16}
                            className="text-text-subtitle shrink-0"
                        />
                        <span className="flex-1">
                            <T
                                keyName={
                                    includeMusic
                                        ? "feedback.attach.music.on"
                                        : "feedback.attach.music.off"
                                }
                            />
                        </span>
                        <label
                            htmlFor="report-music"
                            className="text-text-subtitle cursor-pointer"
                        >
                            <T keyName="feedback.attach.music" />
                        </label>
                        <Switch
                            id="report-music"
                            checked={includeMusic}
                            onCheckedChange={onIncludeMusic}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function RecordingControls({
    recording,
    microphone,
    onMicrophone,
}: {
    recording: ReturnType<typeof useReportRecording>;
    microphone: boolean;
    onMicrophone: (on: boolean) => void;
}) {
    const { state } = recording;
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (state.status !== "recording") return;
        const timer = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(timer);
    }, [state.status]);

    if (state.status === "recording") {
        const seconds = Math.max(0, Math.round((now - state.startedAt) / 1000));
        return (
            <div className="rounded-6 border-red flex items-center gap-12 border p-12">
                <span className="bg-red size-8 animate-pulse rounded-full" />
                <span className="text-body flex-1">
                    <T
                        keyName="feedback.record.recording"
                        params={{ time: formatSeconds(seconds) }}
                    />
                </span>
                <Button
                    type="button"
                    variant="red"
                    size="compact"
                    onClick={recording.stop}
                >
                    <T keyName="feedback.record.stop" />
                </Button>
            </div>
        );
    }
    if (state.status === "done") {
        return (
            <div className="rounded-6 border-stroke flex items-center gap-12 border p-12">
                <span className="text-body flex-1">
                    <T
                        keyName="feedback.record.done"
                        params={{ time: formatSeconds(state.seconds) }}
                    />
                </span>
                <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={recording.discard}
                >
                    <T keyName="feedback.record.discard" />
                </Button>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center gap-12">
                <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={() => void recording.start({ microphone })}
                >
                    <T keyName="feedback.record.start" />
                </Button>
                <div className="flex items-center gap-8">
                    <Checkbox
                        id="report-microphone"
                        checked={microphone}
                        onCheckedChange={(v) => onMicrophone(v === true)}
                    />
                    <label htmlFor="report-microphone" className="text-body">
                        <T keyName="feedback.record.microphone" />
                    </label>
                </div>
            </div>
            <p className="text-sub text-text-subtitle">
                <T keyName="feedback.record.hint" />
            </p>
            {state.status === "failed" && (
                <p className="text-sub text-red">
                    <T keyName={`feedback.record.failed.${state.reason}`} />
                </p>
            )}
        </div>
    );
}

const formatSeconds = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
