/* eslint-disable no-console -- a command-line check: it reports what it found */
// Checks the user guide's pages in a second, without building the site:
// - every <Ui k>, <Kbd action> and <Media id> names something that exists,
// - every page has title, description and type,
// - every link to another guide page points at a page (or a redirect),
// - every setting in the Settings window (settings.json) is named with <Ui k> on a guide page,
// - no banned words or emoji (docs/conventions/user-docs.md), no hard-wrapped lines that
//   start with a component.
//
//   node apps/website/scripts/check-guide.mjs [page.mdx ...]
//
// Exits 1 on errors. Style findings are errors too: fix the sentence, don't add exceptions.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEBSITE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const DOCS = path.join(WEBSITE, "src/content/docs");
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const en = read(path.join(WEBSITE, "../desktop/i18n/en.json"));
const actions = read(path.join(WEBSITE, "src/data/generated/actions.json"));
const settings = read(path.join(WEBSITE, "src/data/generated/settings.json"));
const media = read(path.join(WEBSITE, "src/data/docs-media.json"));
const config = fs.readFileSync(path.join(WEBSITE, "astro.config.mjs"), "utf8");
const redirects = new Set(
    [...config.matchAll(/^\s*"(\/[^"]+)":\s*"/gm)].map((m) =>
        m[1].replace(/\/$/, ""),
    ),
);

/** A key's value; a key may itself contain dots ("settings" › "field.gridLines"), so the longest match wins at each level. */
function lookup(obj, key) {
    if (obj === null || typeof obj !== "object") return undefined;
    const parts = key.split(".");
    for (let i = parts.length; i > 0; i--) {
        const head = parts.slice(0, i).join(".");
        if (!(head in obj)) continue;
        const value = obj[head];
        if (i === parts.length) return value;
        const found = lookup(value, parts.slice(i).join("."));
        if (found !== undefined) return found;
    }
    return undefined;
}

const BANNED = [
    "simply",
    "just",
    "easy",
    "easily",
    "seamless",
    "seamlessly",
    "powerful",
    "intuitive",
    "effortless",
    "effortlessly",
    "robust",
    "leverage",
    "streamline",
    "comprehensive",
    "click on",
    "in this guide",
    "you'll learn",
    "happy marching",
    "that's it",
];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}]/u;

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : /\.mdx?$/.test(e.name) ? [p] : [];
    });
}

const guideDirs = [
    path.join(DOCS, "guides"),
    path.join(DOCS, "troubleshooting"),
];
const allPages = new Set(
    walk(DOCS)
        .map(
            (p) =>
                "/" +
                path
                    .relative(DOCS, p)
                    .replace(/\.mdx?$/, "")
                    .replace(/(^|\/)index$/, "")
                    .toLowerCase(),
        )
        .map((p) => p.replace(/\/$/, "")),
);
const files = process.argv.slice(2).length
    ? process.argv.slice(2).map((p) => path.resolve(p))
    : guideDirs.flatMap(walk);

let errors = 0;
const fail = (file, line, msg) => {
    errors++;
    console.log(`${path.relative(process.cwd(), file)}:${line}: ${msg}`);
};

for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) fail(file, 1, "no frontmatter");
    else
        for (const key of ["title", "description", "type"])
            if (!new RegExp(`^${key}:`, "m").test(fm[1]))
                fail(file, 1, `frontmatter has no ${key}`);
    for (const m of text.matchAll(/<Media\b[^>]*?\bid="([^"]+)"/gs)) {
        const n = text.slice(0, m.index).split("\n").length;
        if (!media[m[1]])
            fail(
                file,
                n,
                `<Media id="${m[1]}">: not recorded (run docs:media ${m[1]})`,
            );
    }
    // A component used but not imported fails only at build time
    for (const c of ["Ui", "Kbd", "Media", "ShortcutList", "MenuList"])
        if (
            new RegExp(`<${c}[\\s/>]`).test(text) &&
            !new RegExp(`^import ${c}\\b`, "m").test(text)
        )
            fail(file, 1, `uses <${c}> but doesn't import it`);
    const lines = text.split("\n");
    let inCode = false;
    lines.forEach((line, i) => {
        const n = i + 1;
        if (line.startsWith("```")) inCode = !inCode;
        if (inCode) return;
        for (const m of line.matchAll(/<Ui\s+k="([^"]+)"/g)) {
            const v = lookup(en, m[1]);
            if (typeof v !== "string")
                fail(file, n, `<Ui k="${m[1]}">: no such string in en.json`);
        }
        for (const m of line.matchAll(/<Kbd\s+action="([^"]+)"/g)) {
            if (!actions[m[1]])
                fail(file, n, `<Kbd action="${m[1]}">: no such action`);
            else if (!actions[m[1]].bindings.length)
                fail(
                    file,
                    n,
                    `<Kbd action="${m[1]}">: the action has no shortcut`,
                );
        }
        for (const m of line.matchAll(
            /\]\((\/(?:guides|troubleshooting)[^)#\s]*)/g,
        )) {
            const target = m[1].replace(/\/$/, "").toLowerCase();
            if (!allPages.has(target) && !redirects.has(target))
                fail(file, n, `link to ${m[1]}: no such page`);
        }
        if (
            n > (fm?.[0].split("\n").length ?? 0) &&
            !line.startsWith("import ")
        ) {
            const prose = line
                .replace(/<[^>]+>/g, " ")
                .replace(/`[^`]*`/g, " ")
                .replace(/\]\([^)]*\)/g, "]");
            for (const word of BANNED)
                if (new RegExp(`\\b${word}\\b`, "i").test(prose))
                    fail(
                        file,
                        n,
                        `"${word}": see docs/conventions/user-docs.md, Voice`,
                    );
            if (EMOJI.test(prose)) fail(file, n, "emoji");
            if (/!\s*$/.test(prose.trim()) || /!\s/.test(prose))
                fail(file, n, "exclamation mark");
        }
        // A wrapped line that starts with an inline component splits its sentence in MDX
        if (
            /^\s*<(Ui|Kbd)\b/.test(line) &&
            i > 0 &&
            lines[i - 1].trim() !== "" &&
            !/^\s*[-*\d]/.test(line)
        )
            fail(
                file,
                n,
                "line starts with an inline component: keep the paragraph on one line",
            );
    });
}
// Every setting the app's Settings window has is described somewhere: whichever pages were named,
// look for each setting's label on all of them (a setting's description stays hand-written)
const named = new Set(
    guideDirs
        .flatMap(walk)
        .flatMap((p) =>
            [...fs.readFileSync(p, "utf8").matchAll(/<Ui\s+k="([^"]+)"/g)].map(
                (m) => m[1],
            ),
        ),
);
for (const section of settings)
    for (const setting of section.settings)
        if (!named.has(setting.key)) {
            errors++;
            console.log(
                `Settings › ${section.label} › ${setting.label}: no guide page describes it (name it with <Ui k="${setting.key}" plain />, usually in guides/reference/settings.mdx)`,
            );
        }

console.log(
    errors
        ? `${errors} problem(s) in the guide`
        : `Guide OK (${files.length} pages)`,
);
process.exit(errors ? 1 : 0);
