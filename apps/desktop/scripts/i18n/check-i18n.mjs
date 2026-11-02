/**
 * `pnpm check:i18n`: keeps user-facing text in the desktop app going through Tolgee.
 *
 * - No new untranslated UI text. Text that predates the check is listed per file in
 *   `i18n-meta/baseline.json`; a file may only go down.
 * - Every literal key passed to `t()` / `<T keyName>` exists in `i18n/en.json`, and inline
 *   defaults match it.
 * - Every new key has translator context in `i18n-meta/context.json`.
 *
 * `--update` rewrites the baseline after text was translated or keys were removed. It never
 * lets new problems in. On a pull request (GITHUB_BASE_REF set) the committed baseline is
 * also compared with the base branch's, so a hand edit can't grow it either.
 * See docs/conventions/localization.md.
 */
import { ESLint } from "eslint";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { knownTranslationKey, noUntranslatedText } from "./rules.mjs";

const require = createRequire(import.meta.url);

const DESKTOP = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);

export const PATHS = {
    english: "i18n/en.json",
    context: "i18n-meta/context.json",
    baseline: "i18n-meta/baseline.json",
};

const SOURCES = ["src/**/*.ts", "src/**/*.tsx"];

/** Not shipped to users, or shown only to developers. */
const IGNORED_SOURCES = [
    "**/__test__/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/*.d.ts",
    "src/field/benchmark/**",
    "src/test/**",
];

export function flattenMessages(tree, prefix = "", into = {}) {
    for (const [key, value] of Object.entries(tree)) {
        const flat = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === "object") {
            flattenMessages(value, flat, into);
        } else {
            into[flat] = String(value);
        }
    }
    return into;
}

async function readJson(dir, file, fallback) {
    try {
        return JSON.parse(await readFile(path.join(dir, file), "utf8"));
    } catch (error) {
        if (error.code === "ENOENT" && fallback !== undefined) return fallback;
        throw new Error(`${file}: ${error.message}`);
    }
}

async function lintSources(dir, english) {
    const eslint = new ESLint({
        cwd: dir,
        useEslintrc: false,
        errorOnUnmatchedPattern: false,
        plugins: {
            i18n: {
                rules: {
                    "no-untranslated-text": noUntranslatedText,
                    "known-translation-key": knownTranslationKey,
                },
            },
        },
        overrideConfig: {
            parser: require.resolve("@typescript-eslint/parser"),
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                ecmaFeatures: { jsx: true },
            },
            plugins: ["i18n"],
            ignorePatterns: IGNORED_SOURCES,
            rules: {
                "i18n/no-untranslated-text": "error",
                "i18n/known-translation-key": ["error", { english }],
            },
        },
    });
    return eslint.lintFiles(SOURCES);
}

function formatProblem(file, message) {
    return `  ${file}:${message.line}:${message.column}  ${message.message}`;
}

/**
 * Runs every check from `dir` (the desktop package). Returns the problems to print and, when
 * `update` is set, writes a baseline that drops whatever was fixed.
 */
const totalText = (baseline) =>
    Object.values(baseline?.untranslatedText ?? {}).reduce((a, b) => a + b, 0);

/**
 * The baseline may move between files (a rename or split) but never grow: its total count
 * can't rise and it can't list a key the base branch didn't.
 */
function compareWithBase(baseline, base) {
    const errors = [];
    const now = totalText(baseline);
    const before = totalText(base);
    if (now > before) {
        errors.push(
            `${PATHS.baseline}: untranslatedText adds up to ${now}, more than the base branch's ${before}. The baseline only shrinks; translate the new text instead.`,
        );
    }
    const baseKeys = new Set(base?.keysWithoutContext ?? []);
    const added = (baseline?.keysWithoutContext ?? []).filter(
        (key) => !baseKeys.has(key),
    );
    if (added.length > 0) {
        errors.push(
            `${PATHS.baseline}: keysWithoutContext gained ${added.join(", ")}. Write their notes in ${PATHS.context} instead.`,
        );
    }
    return errors;
}

/** The base branch's baseline on a pull request, or undefined when there's none to compare. */
export function readBaseBaseline(dir, ref = process.env.GITHUB_BASE_REF) {
    if (!ref) return undefined;
    try {
        execFileSync("git", ["fetch", "--quiet", "--depth=1", "origin", ref], {
            cwd: dir,
            stdio: "ignore",
        });
    } catch {
        console.warn(
            `check:i18n: couldn't fetch ${ref}; skipped the comparison with the base baseline.`,
        );
        return undefined;
    }
    try {
        return JSON.parse(
            execFileSync("git", ["show", `FETCH_HEAD:./${PATHS.baseline}`], {
                cwd: dir,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }),
        );
    } catch {
        return undefined; // The base branch has no baseline yet.
    }
}

export async function checkI18n(
    dir = DESKTOP,
    { update = false, base = undefined } = {},
) {
    const english = flattenMessages(await readJson(dir, PATHS.english));
    const context = await readJson(dir, PATHS.context, {});
    const baseline = await readJson(dir, PATHS.baseline, {
        untranslatedText: {},
        keysWithoutContext: [],
    });

    const errors = base ? compareWithBase(baseline, base) : [];
    const notes = [];

    // Untranslated text and keys, from source.
    const results = await lintSources(dir, english);
    const textByFile = new Map();
    for (const result of results) {
        const file = path
            .relative(dir, result.filePath)
            .split(path.sep)
            .join("/");
        for (const message of result.messages) {
            if (message.fatal) {
                errors.push(formatProblem(file, message));
            } else if (message.ruleId === "i18n/known-translation-key") {
                errors.push(formatProblem(file, message));
            } else if (message.ruleId === "i18n/no-untranslated-text") {
                const list = textByFile.get(file) ?? [];
                list.push(message);
                textByFile.set(file, list);
            }
        }
    }

    const allowedText = baseline.untranslatedText ?? {};
    const nextText = {};
    for (const [file, messages] of [...textByFile].sort()) {
        const allowed = allowedText[file] ?? 0;
        if (messages.length > allowed) {
            const extra = messages.length - allowed;
            errors.push(
                allowed === 0
                    ? `${file}: ${extra} untranslated UI text${extra === 1 ? "" : "s"}:`
                    : `${file}: ${messages.length} untranslated UI texts, up from ${allowed}. All of them, so you can find the new one:`,
                ...messages.map((m) => formatProblem(file, m)),
            );
        }
        nextText[file] = Math.min(messages.length, allowed);
    }
    for (const [file, allowed] of Object.entries(allowedText)) {
        const now = textByFile.get(file)?.length ?? 0;
        if (now < allowed) {
            notes.push(
                `${file}: ${allowed - now} fewer untranslated UI text (now ${now})`,
            );
        }
    }

    // Translator context.
    const allowedWithoutContext = new Set(baseline.keysWithoutContext ?? []);
    const nextWithoutContext = [];
    for (const key of Object.keys(english).sort()) {
        const note = context[key];
        if (typeof note === "string" && note.trim() !== "") continue;
        if (allowedWithoutContext.has(key)) {
            nextWithoutContext.push(key);
        } else {
            errors.push(
                `${PATHS.context}: "${key}" needs translator context: what the text is, where it appears and what it does.`,
            );
        }
    }
    for (const key of Object.keys(context)) {
        if (!(key in english)) {
            errors.push(
                `${PATHS.context}: "${key}" is not in ${PATHS.english}. Remove or rename it.`,
            );
        }
    }
    const staleWithoutContext = [...allowedWithoutContext].filter(
        (key) => !nextWithoutContext.includes(key),
    );
    if (staleWithoutContext.length > 0) {
        notes.push(
            `${staleWithoutContext.length} key(s) in keysWithoutContext now have context or were removed`,
        );
    }

    const nextBaseline = {
        untranslatedText: Object.fromEntries(
            Object.entries(nextText).filter(([, count]) => count > 0),
        ),
        keysWithoutContext: nextWithoutContext,
    };
    const baselineText = `${JSON.stringify(nextBaseline, null, 4)}\n`;
    const currentText = await readFile(
        path.join(dir, PATHS.baseline),
        "utf8",
    ).catch(() => "");
    const stale = baselineText !== currentText.replace(/\r\n/g, "\n");

    if (update && stale) {
        await writeFile(path.join(dir, PATHS.baseline), baselineText);
    } else if (stale) {
        errors.push(
            notes.length > 0
                ? `${PATHS.baseline} is out of date:\n${notes.map((n) => `  ${n}`).join("\n")}\n  Run \`pnpm check:i18n --update\` to lock in the improvement.`
                : `${PATHS.baseline} is missing, out of order or not formatted as the check writes it. Run \`pnpm check:i18n --update\`.`,
        );
    }

    return { errors, updated: update && stale };
}

const isMain = () => {
    try {
        return (
            realpathSync(process.argv[1]) ===
            realpathSync(fileURLToPath(import.meta.url))
        );
    } catch {
        return false;
    }
};

if (isMain()) {
    const update = process.argv.includes("--update");
    const base = readBaseBaseline(DESKTOP);
    const { errors, updated } = await checkI18n(DESKTOP, { update, base });
    if (updated) console.log(`Updated ${PATHS.baseline}.`);
    if (errors.length > 0) {
        console.error(`check:i18n found problems:\n\n${errors.join("\n")}\n`);
        console.error("See docs/conventions/localization.md.");
        process.exitCode = 1;
    } else {
        console.log("check:i18n passed.");
    }
}
