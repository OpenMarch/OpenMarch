/**
 * The message Help › Ask an AI assistant copies, for the user to paste into ChatGPT, Claude or
 * any other assistant. Most people pasting it aren't technical, so it opens in their own voice
 * (their question and setup), and only the part under the divider speaks to the assistant: read
 * the user guide's plain-text copies (`llms.txt`, each page's address plus `.md`, a chapter's
 * file, or `llms-small.txt` pasted by hand), answer in plain numbered steps with the guide's
 * picture or clip, ask whether it worked, and when it looks like a bug, write a report the user
 * can paste into Submit bug or feedback. Nothing about the user's show is included.
 *
 * The message is for the assistant, so it stays in English (assistants answer in the language
 * the user writes to them in); a line says when the app's labels are in another language.
 */
export interface HelpPromptContext {
    /** The guide's site, such as https://openmarch.com */
    readonly site: string;
    readonly version: string;
    readonly app: "desktop" | "web";
    /** macOS, Windows, Linux, iPad or Android tablet */
    readonly system: string;
    readonly mode: "Basic" | "Expert";
    /** The app's language in English ("Spanish"); null or "English" leaves the line out */
    readonly language: string | null;
    /** What the user typed; empty when they left the box blank */
    readonly question: string;
}

export function helpPrompt(ctx: HelpPromptContext): string {
    const question = ctx.question.trim();
    // i18n-ignore: a message for an AI assistant, kept in English on purpose
    const app = ctx.app === "web" ? "the web editor" : "the desktop app";
    const otherLanguage =
        ctx.language && ctx.language !== "English" ? ctx.language : null;
    // i18n-ignore: a message for an AI assistant, kept in English on purpose
    return [
        "I need help with OpenMarch, free drill-writing software for marching bands.",
        "",
        question
            ? `My question: ${question}`
            : "I haven't asked my question yet. Start by asking me what I need help with.",
        "",
        `My setup: OpenMarch ${ctx.version}, ${app} on ${ctx.system}, in ${ctx.mode} mode.`,
        ...(otherLanguage
            ? [
                  `My app is in ${otherLanguage}; the guide's names are in English.`,
              ]
            : []),
        "",
        "--- The rest tells you, the assistant, how to help me ---",
        "",
        `Read the OpenMarch user guide first, and answer only from it. ${ctx.site}/llms.txt lists every page; each has a plain-text copy at its address plus .md (for example ${ctx.site}/guides/timeline/moves.md). If a page won't open, use its chapter's file, listed in llms.txt. If you can't open any of these, tell me in plain words and ask me to open ${ctx.site}/llms-small.txt and paste what it shows here.`,
        "",
        "- I'm not technical and may be in a hurry. Use plain words, answer first.",
        "- Give short numbered steps for my setup, naming buttons, menus and shortcuts as the guide does, with only my system's keys. If a step needs the other mode, say how to switch.",
        "- Link the guide page (its normal address, not the .md copy) and its picture or clip of the step.",
        "- Ask a question only if you can't answer without it. Finish by asking whether it worked.",
        `- If the guide doesn't cover it, say so, don't guess, and send me to ${ctx.site}/guides/start/get-help/. The guide describes the newest version; mine may be older.`,
        `- If I did what the guide says and it still went wrong, say it may be a bug, not my mistake. Check ${ctx.site}/troubleshooting/known-issues.md, then write a report I can copy: what I did, click by click, what I expected, what happened. I'll paste it into "Submit bug or feedback" at the top of the OpenMarch window, where I can also record my screen.`,
        "- Don't ask for my show file.",
    ].join("\n");
}

/** The user's system, as the prompt names it. */
export function helpSystem(isWeb: boolean): string {
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    const platform = nav?.platform ?? "";
    const agent = nav?.userAgent ?? "";
    // An iPad's Safari says it's a Mac, but a Mac has no touch points
    if (
        isWeb &&
        (/iPad/.test(agent) ||
            (/Mac/.test(platform) && nav!.maxTouchPoints > 1))
    )
        return "iPad";
    if (isWeb && /Android/.test(agent)) return "Android tablet";
    if (window.electron?.isMacOS ?? /Mac/.test(platform)) return "macOS";
    if (/Win/.test(platform) || /Windows/.test(agent)) return "Windows";
    return "Linux";
}

/** A language code ("es", "pt-BR") as its English name ("Spanish"), or null. */
export function languageName(code: string | undefined): string | null {
    if (!code) return null;
    try {
        return (
            new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? null
        );
    } catch {
        return null;
    }
}
