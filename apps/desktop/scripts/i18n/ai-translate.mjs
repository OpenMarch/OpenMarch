/**
 * Tooling for translating `i18n/en.json` into the other languages with an AI translator (an agent
 * session or a script calling a model), in batches it can check before anything is merged.
 * See docs/conventions/localization.md ("Translating").
 *
 *   node scripts/i18n/ai-translate.mjs prepare <lang> [--all] [--parts N --part I] --out <file>
 *       Writes a batch: [{ key, english, note, current }] for the keys <lang> lacks (or every
 *       key with --all, current = today's translation), optionally one of N even parts.
 *   node scripts/i18n/ai-translate.mjs check <lang> <batch-input> <batch-output>
 *       Checks a translated batch ({ key: text }): every key present, the same arguments and tags
 *       as English (errors, exit 1), plus warnings for glossary words, spacing and punctuation.
 *   node scripts/i18n/ai-translate.mjs merge <lang> <batch-output>...
 *       Writes the translations into i18n/<lang>.json in English's key order. Keys English no
 *       longer has are dropped.
 *   node scripts/i18n/ai-translate.mjs lint <lang> [--json]
 *       The warnings for the whole language file, for a reviewer.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { translationProblems } from "./translations.mjs";

const ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const LANGUAGES = [
    "es",
    "fr",
    "pt-BR",
    "ja",
    "id",
    "ms",
    "fil",
    "zh-Hans",
    "zh-Hant",
    "th",
];
const read = (file) => JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));

export function flatten(tree, prefix = "", into = {}) {
    for (const [key, value] of Object.entries(tree)) {
        const flat = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === "object")
            flatten(value, flat, into);
        else into[flat] = String(value);
    }
    return into;
}

/** English's tree with each text replaced by `messages[flat key]`; keys without one are left out. */
export function shapeLike(englishTree, messages, prefix = "") {
    const out = {};
    for (const [key, value] of Object.entries(englishTree)) {
        const flat = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === "object") {
            const child = shapeLike(value, messages, flat);
            if (Object.keys(child).length > 0) out[key] = child;
        } else if (messages[flat] !== undefined) {
            out[key] = messages[flat];
        }
    }
    return out;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** English text with ICU syntax and tags blanked out, so glossary words match only prose. */
function prose(message) {
    return message
        .replace(/<\/?[a-zA-Z0-9]+>/g, " ")
        .replace(
            /\{\s*[a-zA-Z0-9_]+\s*,\s*(plural|select|selectordinal)\s*,/g,
            " ",
        )
        .replace(/(=\d+|zero|one|two|few|many|other)\s*\{/g, " ")
        .replace(/\{[a-zA-Z0-9_]+\}/g, " ");
}

const CJK = "\\u3040-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef";

/** Warnings for one translation (never blocking): glossary words, spacing, punctuation. */
export function translationWarnings(
    language,
    key,
    english,
    translated,
    glossary,
) {
    const warnings = [];
    const text = prose(english);
    const lower = translated.toLowerCase();
    for (const term of glossary.terms) {
        const hit = term.match.some((word) =>
            new RegExp(`\\b${escape(word)}\\b`, "i").test(text),
        );
        if (!hit) continue;
        const wanted = [
            term[language],
            ...(term.accept?.[language] ?? []),
        ].filter(Boolean);
        if (!wanted.some((w) => lower.includes(w.toLowerCase()))) {
            warnings.push(
                `glossary: "${term.en}" is usually "${term[language]}"`,
            );
        }
    }
    // Search words for the command palette: space-separated on purpose, English kept too.
    const searchWords = /keywords$/i.test(key);
    if ((language === "ja" || language.startsWith("zh")) && !searchWords) {
        if (new RegExp(`[${CJK}] +[${CJK}]`).test(translated))
            warnings.push("space between Japanese or Chinese words");
        if (/[A-Za-z]{4,}(?: [A-Za-z]{3,}){2,}/.test(prose(translated)))
            warnings.push("looks like untranslated English");
    }
    if (
        language === "fr" &&
        / [:;?!]/.test(translated.replace(/\{[^}]*\}/g, ""))
    )
        warnings.push(
            "ordinary space before : ; ? ! (use a non-breaking space)",
        );
    const words = prose(english).trim().split(/\s+/).filter(Boolean);
    if (translated === english && words.length >= 3 && !searchWords)
        warnings.push("same as English");
    return warnings;
}

function args(argv) {
    const flags = {};
    const rest = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith("--")) {
            const name = argv[i].slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith("--")) flags[name] = true;
            else flags[name] = argv[++i];
        } else rest.push(argv[i]);
    }
    return { flags, rest };
}

function language(code) {
    if (!LANGUAGES.includes(code))
        throw new Error(`language must be one of ${LANGUAGES.join(", ")}`);
    return code;
}

function main(argv) {
    const [command, ...more] = argv;
    const { flags, rest } = args(more);
    const englishTree = read("i18n/en.json");
    const english = flatten(englishTree);
    const glossary = read("i18n-meta/glossary.json");

    if (command === "prepare") {
        const lang = language(rest[0]);
        const current = flatten(read(`i18n/${lang}.json`));
        const context = read("i18n-meta/context.json");
        let keys = Object.keys(english).filter(
            (k) => flags.all || current[k] === undefined,
        );
        const parts = Number(flags.parts ?? 1);
        const part = Number(flags.part ?? 1);
        const size = Math.ceil(keys.length / parts);
        keys = keys.slice((part - 1) * size, part * size);
        const batch = keys.map((key) => ({
            key,
            english: english[key],
            note: context[key] ?? "",
            current: current[key] ?? null,
        }));
        writeFileSync(flags.out, JSON.stringify(batch, null, 2) + "\n");
        console.log(`${batch.length} keys → ${flags.out}`);
        return 0;
    }

    if (command === "check") {
        const lang = language(rest[0]);
        const input = JSON.parse(readFileSync(rest[1], "utf8"));
        const output = JSON.parse(readFileSync(rest[2], "utf8"));
        const errors = [];
        const warnings = [];
        for (const { key } of input) {
            const translated = output[key];
            if (typeof translated !== "string" || translated.trim() === "") {
                errors.push(`${key}: missing`);
                continue;
            }
            for (const p of translationProblems(english[key], translated))
                errors.push(`${key}: ${p}`);
            for (const w of translationWarnings(
                lang,
                key,
                english[key],
                translated,
                glossary,
            ))
                warnings.push(`${key}: ${w}`);
        }
        const inputKeys = new Set(input.map((i) => i.key));
        for (const key of Object.keys(output))
            if (!inputKeys.has(key)) errors.push(`${key}: not in this batch`);
        for (const w of warnings) console.log(`warning ${w}`);
        for (const e of errors) console.log(`ERROR ${e}`);
        console.log(
            `${input.length} keys, ${errors.length} errors, ${warnings.length} warnings`,
        );
        return errors.length ? 1 : 0;
    }

    if (command === "merge") {
        const lang = language(rest[0]);
        const file = `i18n/${lang}.json`;
        const messages = flatten(read(file));
        for (const batch of rest.slice(1)) {
            const output = JSON.parse(readFileSync(batch, "utf8"));
            for (const [key, text] of Object.entries(output)) {
                const problems =
                    english[key] === undefined
                        ? ["not in English"]
                        : translationProblems(english[key], text);
                if (problems.length)
                    throw new Error(`${batch} ${key}: ${problems.join("; ")}`);
                messages[key] = text;
            }
        }
        writeFileSync(
            path.join(ROOT, file),
            JSON.stringify(shapeLike(englishTree, messages), null, 4) + "\n",
        );
        const have = Object.keys(english).filter(
            (k) => messages[k] !== undefined,
        ).length;
        console.log(`${file}: ${have} of ${Object.keys(english).length} keys`);
        return 0;
    }

    if (command === "lint") {
        const lang = language(rest[0]);
        const messages = flatten(read(`i18n/${lang}.json`));
        const found = [];
        for (const [key, text] of Object.entries(messages)) {
            if (english[key] === undefined) continue;
            for (const w of translationWarnings(
                lang,
                key,
                english[key],
                text,
                glossary,
            ))
                found.push({
                    key,
                    english: english[key],
                    translated: text,
                    warning: w,
                });
        }
        if (flags.json) console.log(JSON.stringify(found, null, 2));
        else
            for (const f of found)
                console.log(
                    `${f.key}: ${f.warning}\n    en: ${f.english}\n    ${lang}: ${f.translated}`,
                );
        const missing = Object.keys(english).filter(
            (k) => messages[k] === undefined,
        ).length;
        console.error(
            `${lang}: ${found.length} warnings, ${missing} keys untranslated`,
        );
        return 0;
    }

    console.error("usage: ai-translate.mjs prepare|check|merge|lint <lang> …");
    return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
