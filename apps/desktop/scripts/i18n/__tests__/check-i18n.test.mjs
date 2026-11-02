import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { checkI18n, PATHS } from "../check-i18n.mjs";

const fixtures = [];
after(async () => {
    await Promise.all(
        fixtures.map((dir) => rm(dir, { recursive: true, force: true })),
    );
});

const json = (value) => `${JSON.stringify(value, null, 4)}\n`;

/**
 * A desktop package with one source file (`src/View.tsx`, or `files` by path), en.json,
 * context and a baseline.
 */
async function fixture({
    source,
    files = { "src/View.tsx": source },
    english = { menu: { save: "Save" } },
    context = { "menu.save": "Menu item that saves the show." },
    baseline = { untranslatedText: {}, keysWithoutContext: [] },
}) {
    const dir = await mkdtemp(path.join(tmpdir(), "check-i18n-"));
    fixtures.push(dir);
    await mkdir(path.join(dir, "i18n"), { recursive: true });
    await mkdir(path.join(dir, "i18n-meta"), { recursive: true });
    for (const [file, text] of Object.entries(files)) {
        await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
        await writeFile(path.join(dir, file), text);
    }
    await writeFile(path.join(dir, PATHS.english), json(english));
    await writeFile(path.join(dir, PATHS.context), json(context));
    await writeFile(path.join(dir, PATHS.baseline), json(baseline));
    return dir;
}

const translated = `
import { useTranslate } from "@tolgee/react";
export function View() {
    const { t } = useTranslate();
    return <button title={t("menu.save")}>{t("menu.save", "Save")}</button>;
}
`;

test("passes translated text", async () => {
    const { errors } = await checkI18n(await fixture({ source: translated }));
    assert.deepEqual(errors, []);
});

test("flags JSX text, text props, literal expressions and toasts", async () => {
    const source = `
export function View({ on }: { on: boolean }) {
    toast.error("Couldn't save");
    return (
        <div aria-label="Toolbar" className="flex gap-4">
            Hello
            <input placeholder={\`Type \${on}\`} />
            {on ? "On" : "Off"}
            <code>pnpm dev</code>
            {" · "}
        </div>
    );
}
`;
    const { errors } = await checkI18n(await fixture({ source }));
    const text = errors.join("\n");
    assert.match(text, /src\/View\.tsx: 6 untranslated UI texts/);
    for (const found of [
        '"Couldn\'t save"',
        '"Toolbar"',
        "Hello",
        "`Type ${on}`",
        '"On"',
        '"Off"',
    ]) {
        assert.ok(text.includes(found), `expected ${found} in:\n${text}`);
    }
    assert.ok(!text.includes("pnpm dev"));
    assert.ok(!text.includes("flex gap-4"));
});

test("an i18n-ignore comment covers its line and the next", async () => {
    const source = `
export function View() {
    return (
        <div>
            {/* i18n-ignore: brand name */}
            <span>OpenMarch</span>
            <span title="Brand" /> {/* i18n-ignore: brand name */}
        </div>
    );
}
`;
    const { errors } = await checkI18n(await fixture({ source }));
    assert.deepEqual(errors, []);
});

test("baselined text passes, but one more in the same file fails", async () => {
    const source = `export const View = () => <p>Old</p>;`;
    const baseline = {
        untranslatedText: { "src/View.tsx": 1 },
        keysWithoutContext: [],
    };
    assert.deepEqual(
        (await checkI18n(await fixture({ source, baseline }))).errors,
        [],
    );

    const more = `export const View = () => <p>Old <b>New</b></p>;`;
    const { errors } = await checkI18n(
        await fixture({ source: more, baseline }),
    );
    assert.match(errors.join("\n"), /2 untranslated UI texts, up from 1/);
});

test("fixed text makes the baseline stale until --update shrinks it", async () => {
    const baseline = {
        untranslatedText: { "src/View.tsx": 2 },
        keysWithoutContext: [],
    };
    const dir = await fixture({ source: translated, baseline });

    const stale = await checkI18n(dir);
    assert.match(stale.errors.join("\n"), /out of date[\s\S]*2 fewer/);

    const updated = await checkI18n(dir, { update: true });
    assert.deepEqual(updated.errors, []);
    assert.equal(updated.updated, true);
    const written = JSON.parse(
        await readFile(path.join(dir, PATHS.baseline), "utf8"),
    );
    assert.deepEqual(written.untranslatedText, {});
});

test("--update never adds new untranslated text to the baseline", async () => {
    const dir = await fixture({
        source: `export const View = () => <p>New</p>;`,
    });
    const { errors } = await checkI18n(dir, { update: true });
    assert.match(errors.join("\n"), /1 untranslated UI text:/);
    const written = JSON.parse(
        await readFile(path.join(dir, PATHS.baseline), "utf8"),
    );
    assert.deepEqual(written.untranslatedText, {});
});

test("a key missing from en.json fails, for t() and <T>", async () => {
    const source = `
export function View() {
    return (
        <>
            {t("menu.open")}
            {tolgee.t("menu.close", "Close")}
            <T keyName="menu.quit" />
        </>
    );
}
`;
    const { errors } = await checkI18n(await fixture({ source }));
    const text = errors.join("\n");
    for (const key of ["menu.open", "menu.close", "menu.quit"]) {
        assert.match(text, new RegExp(`Key "${key}" is not in i18n/en.json`));
    }
});

test("an inline default that differs from en.json fails", async () => {
    const source = `
export const View = () => (
    <>
        {t("menu.save", "Save it")}
        {t("menu.save", { defaultValue: "Save" })}
        <T keyName="menu.save" defaultValue="Save now" />
    </>
);
`;
    const { errors } = await checkI18n(await fixture({ source }));
    assert.equal(errors.filter((e) => e.includes("inline default")).length, 2);
});

test("a new key needs translator context; baselined keys don't", async () => {
    const english = { menu: { save: "Save", open: "Open", quit: "Quit" } };
    const baseline = {
        untranslatedText: {},
        keysWithoutContext: ["menu.open"],
    };
    const { errors } = await checkI18n(
        await fixture({ source: translated, english, baseline }),
    );
    assert.deepEqual(errors, [
        `${PATHS.context}: "menu.quit" needs translator context: what the text is, where it appears and what it does.`,
    ]);
});

test("context for a key that isn't in en.json fails", async () => {
    const context = {
        "menu.save": "Menu item that saves the show.",
        "menu.gone": "Old key.",
    };
    const { errors } = await checkI18n(
        await fixture({ source: translated, context }),
    );
    assert.match(errors.join("\n"), /"menu\.gone" is not in i18n\/en\.json/);
});

test("an ignore comment covers the whole next element or statement", async () => {
    const source = `
export function View() {
    // i18n-ignore: developer-only notice
    toast.error(
        "A long developer-only message that prettier wraps onto its own line",
    );
    return (
        <div>
            {
                /* i18n-ignore: product name, the same in every language */
            }
            <span>
                OpenMarch
            </span>
            <span>Translate me</span>
        </div>
    );
}
`;
    const { errors } = await checkI18n(await fixture({ source }));
    const text = errors.join("\n");
    assert.match(text, /1 untranslated UI text:/);
    assert.ok(text.includes("Translate me"));
});

test("an ignore comment needs a reason", async () => {
    const source = `
export const View = () => (
    <div>
        {/* i18n-ignore */}
        <span>OpenMarch</span>
    </div>
);
`;
    const { errors } = await checkI18n(await fixture({ source }));
    assert.match(errors.join("\n"), /1 untranslated UI text:/);
});

test("flags concatenation, toast options and tooltip content, not button variants", async () => {
    const source = `
export function View({ n }: { n: number }) {
    toast.promise(save(), { loading: "Saving", success: "Saved", id: "save-toast" });
    return (
        <div>
            {"Page " + n}
            <InfoTip content="Explained" />
            <Button content="icon" />
        </div>
    );
}
`;
    const { errors } = await checkI18n(await fixture({ source }));
    const text = errors.join("\n");
    assert.match(text, /4 untranslated UI texts/);
    for (const found of ['"Saving"', '"Saved"', '"Page "', '"Explained"']) {
        assert.ok(text.includes(found), `expected ${found} in:\n${text}`);
    }
    assert.ok(!text.includes("save-toast"));
    assert.ok(!text.includes('"icon"'));
});

test("template-literal keys are checked; an ignore comment skips a non-Tolgee t()", async () => {
    const source = `
export const View = () => (
    <>
        {t(\`menu.missing\`)}
        {/* i18n-ignore: date library, not Tolgee */}
        {dates.t("not.a.key")}
    </>
);
`;
    const { errors } = await checkI18n(await fixture({ source }));
    const text = errors.join("\n");
    assert.match(text, /Key "menu\.missing"/);
    assert.ok(!text.includes("not.a.key"));
});

test("against the base branch, the baseline may move between files but not grow", async () => {
    const source = `export const View = () => <p>Old</p>;`;
    const moved = {
        untranslatedText: { "src/View.tsx": 1 },
        keysWithoutContext: [],
    };
    const base = {
        untranslatedText: { "src/OldName.tsx": 1 },
        keysWithoutContext: [],
    };
    const ok = await checkI18n(await fixture({ source, baseline: moved }), {
        base,
    });
    assert.deepEqual(ok.errors, []);

    const grown = await checkI18n(await fixture({ source, baseline: moved }), {
        base: { untranslatedText: {}, keysWithoutContext: [] },
    });
    assert.match(
        grown.errors.join("\n"),
        /adds up to 1, more than the base branch's 0/,
    );

    const english = { menu: { save: "Save", quit: "Quit" } };
    const keyAdded = await checkI18n(
        await fixture({
            source: translated,
            english,
            baseline: {
                untranslatedText: {},
                keysWithoutContext: ["menu.quit"],
            },
        }),
        { base: { untranslatedText: {}, keysWithoutContext: [] } },
    );
    assert.match(
        keyAdded.errors.join("\n"),
        /keysWithoutContext gained menu\.quit/,
    );
});

test("a baseline checked out with CRLF line endings isn't stale", async () => {
    const dir = await fixture({ source: translated });
    const file = path.join(dir, PATHS.baseline);
    await writeFile(
        file,
        (await readFile(file, "utf8")).replace(/\n/g, "\r\n"),
    );
    assert.deepEqual((await checkI18n(dir)).errors, []);
});

test("main-process keys are checked, and labelKey-style properties hold keys", async () => {
    const files = {
        "electron/main/menu.ts": `
import { t } from "./i18n";
export const items = [
    { label: t("menu.save"), click() {} },
    { label: t("menu.missing"), click() {} },
];
`,
        "src/global/menuActions.ts": `
export const ACTIONS = [
    { action: "save", labelKey: "menu.save" },
    { action: "gone", labelKey: "menu.gone" },
    { action: "custom", labelKey: "" },
];
`,
    };
    const { errors } = await checkI18n(await fixture({ files }));
    const text = errors.join("\n");
    assert.match(text, /electron\/main\/menu\.ts:5:\d+ +Key "menu\.missing"/);
    assert.match(text, /src\/global\/menuActions\.ts:4:\d+ +Key "menu\.gone"/);
    assert.equal(errors.length, 2, text);
});

test("flags a main-process role menu item without a label", async () => {
    const files = {
        "electron/main/menu.ts": `
import { t } from "./i18n";
export const items = (copy: object) => [
    { role: "undo" },
    { role: "copy", label: t("menu.save") },
    { ...copy, role: "copy" },
    { role: "paste" }, // i18n-ignore: a test of the ignore comment
    { type: "separator" },
];
`,
    };
    const { errors } = await checkI18n(await fixture({ files }));
    const text = errors.join("\n");
    assert.match(text, /electron\/main\/menu\.ts: 1 untranslated UI text:/);
    assert.match(text, /menu\.ts:4:\d+ +.*menu item "undo" has no label/);
    assert.ok(!text.includes('"paste"'), text);
});

test("flags the main process's literal dialog, menu and window text", async () => {
    const files = {
        "electron/main/index.ts": `
import { BrowserWindow, dialog } from "electron";
export async function run(win: BrowserWindow, path: string) {
    dialog.showErrorBox("Couldn't open", path);
    await dialog.showSaveDialog(win, {
        title: "Save a copy",
        buttonLabel: t("menu.save"),
        filters: [{ name: "Show file", extensions: ["dots"] }],
    });
    await dialog.showMessageBox(win, { message: "Converted", buttons: ["OK"] });
    new BrowserWindow({ title: "Settings", width: 800 });
    win.setTitle("OpenMarch - " + path); // i18n-ignore: product name and path
    console.log("Not UI text");
    return [{ label: "Open File", click() {} }, { label: "Not a menu" }];
}
`,
    };
    const { errors } = await checkI18n(await fixture({ files }));
    const text = errors.join("\n");
    assert.match(text, /electron\/main\/index\.ts: 7 untranslated UI texts/);
    for (const found of [
        `"Couldn't open"`,
        '"Save a copy"',
        '"Show file"',
        '"Converted"',
        '"OK"',
        '"Settings"',
        '"Open File"',
    ]) {
        assert.ok(text.includes(found), `expected ${found} in:\n${text}`);
    }
    for (const missing of ["OpenMarch", "Not UI text", "Not a menu"]) {
        assert.ok(!text.includes(missing), `didn't expect ${missing}`);
    }
});
