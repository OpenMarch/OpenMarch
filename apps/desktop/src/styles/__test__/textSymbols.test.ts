import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

/**
 * Keeps symbols from showing as color emoji (see packages/ui/src/text-symbols.css). Some
 * characters, such as ↩ and ↔, are text by default but have an emoji form; when the UI
 * font lacks one, the browser can land on an emoji font in the stack. A trailing U+FE0E
 * doesn't prevent that in Chromium. So every such character in UI text must be covered
 * by "OpenMarch Text Symbols", every in-app font stack built on DM Sans or DM Mono must
 * list that family, and real emoji (🎺, or a character followed by U+FE0F) are only
 * allowed where listed below.
 *
 * Out of scope: exports (PDF, SVG, coordinate sheets, video overlay text) use system font
 * stacks of their own and can't load the app's web fonts.
 */

const FAMILY = "OpenMarch Text Symbols";
const DESKTOP = resolve(__dirname, "../../..");
const REPO = resolve(DESKTOP, "../..");
const UI = resolve(REPO, "packages/ui");

/** Emoji written on purpose; each entry must still be in use */
const INTENDED_EMOJI: { path: RegExp; chars: string; why: string }[] = [
    {
        path: /^apps\/desktop\/i18n\/[^/]+\.json$/,
        chars: "🎭🎺📋🧹👟🖌🎯",
        why: "export loading messages and the Playwright codegen banner",
    },
    {
        path: /^apps\/desktop\/src\/App\.tsx$/,
        chars: "🎭",
        why: "a console message in Playwright codegen mode",
    },
];

/** Text-default emoji characters DM Sans itself draws, so they never reach an emoji font */
const IN_DM_SANS = [..."©®™"].map((ch) => ch.codePointAt(0)!);

const VS15 = 0xfe0e;
const VS16 = 0xfe0f;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const isEmojiByDefault = (ch: string) => /\p{Emoji_Presentation}/u.test(ch);

function walk(dir: string, keep: (path: string) => boolean): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            if (
                ["node_modules", "__test__", "generated", "dist"].includes(
                    entry.name,
                )
            )
                return [];
            return walk(path, keep);
        }
        return keep(path) ? [path] : [];
    });
}

/** Source, style and message files whose text can reach the screen, repo-relative */
function uiFiles(): string[] {
    const source = (path: string) =>
        /\.(tsx?|css)$/.test(path) && !/\.(test|spec)\.tsx?$/.test(path);
    return [
        ...walk(resolve(DESKTOP, "src"), source).filter(
            (path) => !path.startsWith(resolve(DESKTOP, "src/test") + "/"),
        ),
        ...walk(resolve(DESKTOP, "view3d-web"), source),
        ...walk(resolve(UI, "src"), source),
        ...walk(resolve(DESKTOP, "i18n"), (path) => path.endsWith(".json")),
    ].map((path) => relative(REPO, path));
}

/** A piece of text that can reach the screen, and where it starts */
interface Text {
    text: string;
    line: number;
}

/**
 * String, template and JSX text in a TS/TSX file, with escapes such as "\u21A9" already
 * read as the character; comments are never included
 */
function tsTexts(file: string, source: string): Text[] {
    const sf = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        false,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const texts: Text[] = [];
    const visit = (node: ts.Node) => {
        if (
            ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node) ||
            ts.isJsxText(node)
        ) {
            const start = node.getStart(sf);
            texts.push({
                text: node.text,
                line: sf.getLineAndCharacterOfPosition(start).line + 1,
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
    return texts;
}

/** The file's text with comments blanked out, keeping line numbers */
function withoutCssComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
        comment.replace(/[^\n]/g, " "),
    );
}

/** Texts of a file worth checking, split per line for reporting */
function textsOf(file: string): Text[] {
    const source = readFileSync(resolve(REPO, file), "utf8");
    if (!PICTOGRAPHIC.test(source)) return [];
    const whole: Text[] = /\.tsx?$/.test(file)
        ? tsTexts(file, source)
        : [
              {
                  text: file.endsWith(".css")
                      ? withoutCssComments(source)
                      : source,
                  line: 1,
              },
          ];
    return whole.flatMap(({ text, line }) =>
        PICTOGRAPHIC.test(text)
            ? text
                  .split("\n")
                  .map((part, i) => ({ text: part, line: line + i }))
            : [],
    );
}

function parseUnicodeRanges(css: string): Set<number> {
    const covered = new Set<number>();
    for (const [, ranges] of css.matchAll(/unicode-range:([^;]+);/g)) {
        for (const [, from, to] of ranges!.matchAll(
            /U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi,
        )) {
            const start = parseInt(from!, 16);
            const end = to ? parseInt(to, 16) : start;
            for (let c = start; c <= end; c++) covered.add(c);
        }
    }
    return covered;
}

const SYMBOLS_CSS = resolve(UI, "src/text-symbols.css");
const symbolsCss = readFileSync(SYMBOLS_CSS, "utf8");
const tailwind = readFileSync(resolve(UI, "src/tailwind.css"), "utf8");

function stack(variable: string): string[] {
    return new RegExp(`${variable}:([^;]+);`)
        .exec(tailwind)![1]!
        .split(",")
        .map((family) => family.trim().replace(/^"|"$/g, ""));
}

describe("text symbols never show as color emoji", () => {
    it("lists the symbols family right after the brand font in both shared stacks", () => {
        const sans = stack("--font-sans");
        expect(sans.slice(0, 2)).toEqual(["DM Sans", FAMILY]);
        expect(
            sans.findIndex((family) => /emoji/i.test(family)),
        ).toBeGreaterThan(1);
        expect(stack("--font-mono").slice(0, 2)).toEqual(["DM Mono", FAMILY]);
    });

    it("defines the family from vendored font files, in the shared styles", () => {
        const urls = [...symbolsCss.matchAll(/url\("([^"]+)"\)/g)].map(
            ([, url]) => url!,
        );
        expect(urls.length).toBeGreaterThan(0);
        for (const url of urls) {
            // A bundler resolves a package URL from the importing app, which may lack it
            expect(url).toMatch(/^\.\//);
            expect(
                existsSync(resolve(dirname(SYMBOLS_CSS), url)),
                `${url} exists`,
            ).toBe(true);
        }
        expect(symbolsCss).toContain(`font-family: "${FAMILY}"`);
        // A face still loading must not leave the symbol blank
        expect(symbolsCss).not.toMatch(/font-display:\s*block/);
        expect(tailwind).toContain('@import "./text-symbols.css"');
    });

    it("lists the family in every other font stack built on DM Sans or DM Mono", () => {
        const problems: string[] = [];
        const websiteStyles = walk(
            resolve(REPO, "apps/website/src/styles"),
            (path) => path.endsWith(".css"),
        ).map((path) => relative(REPO, path));
        for (const file of [...uiFiles(), ...websiteStyles]) {
            if (file.endsWith(".json")) continue;
            const source = readFileSync(resolve(REPO, file), "utf8");
            if (!/DM (Sans|Mono)/.test(source)) continue;
            const texts = file.endsWith(".css")
                ? withoutCssComments(source)
                      .split("\n")
                      .map((text, i) => ({ text, line: i + 1 }))
                : tsTexts(file, source);
            for (const { text, line } of texts) {
                const namesBrand =
                    /DM (Sans|Mono)["']?\s*,/.test(text) ||
                    /font-family:\s*["']?DM (Sans|Mono)["']?\s*[;}]/.test(text);
                if (namesBrand && !text.includes(FAMILY))
                    problems.push(
                        `${file}:${line}: font stack lacks "${FAMILY}" after DM Sans/DM Mono, or use var(--font-sans)/var(--font-mono)`,
                    );
            }
        }
        expect(problems).toEqual([]);
    });

    it("covers every text-default emoji character in UI text, and emoji are intended", () => {
        const covered = parseUnicodeRanges(symbolsCss);
        for (const code of IN_DM_SANS) covered.add(code);
        const used = new Set<RegExp>();
        const problems: string[] = [];
        for (const file of uiFiles()) {
            for (const { text, line } of textsOf(file)) {
                const chars = [...text];
                chars.forEach((ch, i) => {
                    if (!PICTOGRAPHIC.test(ch)) return;
                    const at = `${file}:${line}`;
                    const code = ch.codePointAt(0)!;
                    const name = `${ch} U+${code.toString(16).toUpperCase()}`;
                    const next = chars[i + 1]?.codePointAt(0);
                    if (isEmojiByDefault(ch) || next === VS16) {
                        const allowed = INTENDED_EMOJI.find(
                            (entry) =>
                                entry.path.test(file) &&
                                [...entry.chars].includes(ch),
                        );
                        if (allowed) used.add(allowed.path);
                        else
                            problems.push(
                                `${at}: emoji ${name}. If it's meant, add it to INTENDED_EMOJI; else use a text symbol or a Phosphor icon`,
                            );
                    } else if (!covered.has(code)) {
                        problems.push(
                            `${at}: ${name} can show as an emoji and "${FAMILY}" has no text glyph for it${next === VS15 ? " (U+FE0E doesn't stop that in Chromium)" : ""}; add a font face for it or use a Phosphor icon`,
                        );
                    }
                });
            }
        }
        expect(problems).toEqual([]);
        expect(
            INTENDED_EMOJI.filter((entry) => !used.has(entry.path)).map(
                (entry) => entry.why,
            ),
        ).toEqual([]);
    });
});
