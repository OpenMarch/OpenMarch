# Localization

The desktop app's text is translated with [Tolgee](https://tolgee.io). Write every
piece of user-facing text through Tolgee as you build, even though only English
ships at first. Translators fill in the other languages later, from the English
text and the context you leave for them.

`pnpm check:i18n` enforces this for the renderer (`apps/desktop/src`), the Electron
main process and preload (`apps/desktop/electron`), and the web build's page and worker
(`apps/desktop/web`). It runs in `pnpm check:quick`, in
the pre-commit hook when desktop source or i18n files change, and in PR checks.

## What counts as user-facing text

Anything a person can read or hear:

- JSX text and string expressions shown in JSX (`{on ? "On" : "Off"}`,
  `{"Page " + n}`).
- Text props: `title`, `aria-label` and the other `aria-*` text props, `placeholder`,
  `alt`, `label`, `text`, `tooltip`, `description`, `heading`, `message`, `content`
  (except on buttons, where it's a layout variant), and props ending in `Label`,
  `Text`, `Title`, `Tooltip`, `Description` or `Message`.
- Toasts (`toast.*` and the text fields of their options, `conToastError`) and
  `alert` / `confirm`.
- Error messages a user sees, and screen-reader text (`sr-only`, `aria-label`).

Not user-facing: class names, ids, test ids, log messages, keys, file formats, and
code shown as code (`<code>`, `<pre>`).

### What the check can't see

A passing check doesn't mean the text is translated. It only sees literals written
directly in the places above, so these stay your responsibility:

- Text built elsewhere and passed in through a variable or a prop not in the list.
- Error messages (`throw new Error("…")`) that end up on screen.
- `t` renamed on import (`const { t: translate } = …`); keys aren't checked there.
- In the main process, the check sees `t()` keys and literal text in native dialogs
  (`dialog.show*` text options, `buttons`, file-filter `name`s, `dialog.showErrorBox`),
  menu item labels, role menu items without a `label`, and window titles
  (`new BrowserWindow({ title })`, `setTitle`). It doesn't see text main returns to the renderer (error messages in IPC results,
  thrown errors), or dialog and menu options built in a helper and passed in.
- Text the web build sets on the page directly (`textContent`, `setAttribute("aria-label", …)`,
  `alert`) and errors its worker throws.
- `packages/ui` isn't checked. It has no translations, so its components take every
  piece of text through props, with no English default; pass translated text from
  the app.

Keys written in `labelKey`-style properties (`labelKey`, `titleKey`, `messageKey`,
`descriptionKey`, `detailKey`, `tooltipKey`, `placeholderKey`) for code elsewhere to
translate are checked like `t()` keys.

## How to add text

1. Add the key and its English text to `apps/desktop/i18n/en.json`. Don't edit the
   other language files; they come from Tolgee.
2. Add translator context for the key to `apps/desktop/i18n-meta/context.json` (see
   below).
3. Show it with Tolgee:
   - In components, `const { t } = useTranslate();` then `t("timeline.loop.on")`, or
     `<T keyName="timeline.loop.on" />`.
   - Outside React, `tolgee.t("timeline.loop.on")` from `@/global/singletons/Tolgee`.
   - An inline default (`t("key", "English")`) is allowed but must match `en.json`
     exactly; the check fails if they drift.

Key names are `<area>.<feature>.<thing>`, for example
`timeline.rangeMenu.setAsShown`. Reuse an existing key only when the text means
the same thing in the same place; "Set" on a button and "Set" as a state can
translate differently.

### Main process

The Electron main process translates with `t()` from `apps/desktop/electron/main/i18n.ts`:
the same keys, `en.json` and ICU formatting as the renderer, with English for keys a
language lacks. It follows the app language the renderer saves (the `language`
setting).

- Call `t()` when the text is shown: build dialog options, file filters and menu
  templates in a function, never in a module-level constant, or they keep the
  language they were first read in.
- The application menu is built by `buildApplicationMenu()` and rebuilt when the
  language changes; a context menu is built each time it opens. Give role items
  (`cut`, `zoomIn`) a `label` too: Electron's own role labels are English only, in
  every language, so the check flags a role item without one.
- Window titles are set when the window opens; a window whose renderer sets
  `document.title` follows language changes from there.
- Text for the renderer to show: prefer returning a code and let the renderer word
  it. When main words it, use `t()`. Code the web build or a worker also runs
  (`electron/database`, modules `web/` imports) must not import `i18n.ts`; return the
  key instead (`messageKey`, `messageParams`) and translate where it's shown. The same
  goes for `src/db-functions` (the convert-on-open worker runs it): refusals carry their
  text as keys (`text.t`), and logs use `timelineTextForLog`.

### Web build

The web build (`apps/desktop/web`) runs the main process's work in a worker, which
doesn't load Tolgee. An error the worker words for the person is one of `WORKER_ERRORS`
in `web/protocol.ts`, sent with its key as the message; the page translates it when it
arrives (`web/renderer/workerErrors.ts`). Text the page shows before the app starts
(notices, the version switch) waits for `tolgee.run()`; only a message for when the
translations themselves fail to load stays in English, with an `i18n-ignore`.

- Native menus and dialogs can't show a `Shortcut`, so a shortcut there is plain text in
  the string's arguments (`menu.withShortcut`).

## Writing translatable strings

- Never build a sentence from pieces (`"Page " + label + " flag"`). Other languages
  reorder words. Use one string with arguments: `"Page {page}'s flag"`.
- Counts use ICU plurals: `"{count, plural, one {# marcher} other {# marchers}}"`.
- When a branch means exactly one rather than the singular form of a number, write
  `=1`, not `one`: `"{count, plural, =1 {Page {first} follows} other {Pages {first}–{last} follow}}"`.
  That covers a branch that doesn't show the number (`#`): "A cue uses it", "Keep Page 3",
  "it" or "them" for the marchers, a verb that agrees with a list of names. In some
  languages `one` also matches 21 (Russian), and Japanese has no `one` at all, so a `one`
  branch with that wording would show for the wrong counts, or never.
- Join a list with `formatList` or `formatAndList` (`src/utilities/formatList.ts`), never
  `", "`. Code that can't import Tolgee returns the items and leaves the joining to the
  caller.
- Inline elements are tags in the string, rendered with `<T params>`:
  `"zoom out with <keys></keys>"` and
  `<T keyName="…" params={{ keys: () => <Shortcut … /> }} />`. Keyboard shortcuts
  always render with `Shortcut`, never as text in the string (see `apps/desktop/AGENTS.md`).
- Units and short labels (`"fps"`, `"X:"`, `"bpm"`) are text too.

## Translator context

`apps/desktop/i18n-meta/context.json` maps each key to a note for translators, kept
in key order:

```json
{
  "timeline.rangeMenu.setAsShown": "Menu item in a page's right-click menu on the timeline. Stores the selected marchers' current on-field positions as set (fixed) positions on that page, so they stop following the move around them."
}
```

Say what the text is (button, menu item, tooltip, toast, screen-reader label),
where it appears, and what it does or means. Explain OpenMarch terms (set, move,
page flag, start flag, count) and every `{argument}`. A translator sees only the
string and this note, with no access to the code or the app, so the note has to
stand on its own.

When you change a key's English text or what it does, update its note in the same
change. A stale note misleads more than a missing one, and the check can't tell.

Every new key needs context. Keys that existed before the check are listed in
`keysWithoutContext` in `apps/desktop/i18n-meta/baseline.json`; adding their context
is welcome.

## Changing a key

The other languages keep their translation of a key until Tolgee retranslates it,
so a translation made for the old English stays on screen after you change it:

- A change that keeps the meaning, arguments and tags (a typo, `one {` to `=1 {`,
  a plural for English only) keeps the key. The old translations still fit.
- A change to the arguments or tags, or to what the text says, needs a **new key
  name**. Then the other languages fall back to English until they're translated,
  instead of showing the old meaning or "invalid". Move the note to the new key,
  and don't edit the other language files.

`pnpm check:i18n` checks every language file against English: a translation may
only use the arguments and tags its English has, can't print a `select` argument
as is, and must parse. If a pulled translation fails, fix it in Tolgee, or rename
the key when the English changed.

## Source of truth and syncing

`apps/desktop/i18n/en.json` in the repository is the source of English text and
keys; Tolgee follows it. Push English to Tolgee rather than editing it there. Tolgee's
file push doesn't carry descriptions, so a sync also copies the notes from
`context.json` into Tolgee's key descriptions. Pulling translations back
(`tolgee pull`) rewrites the language files; if a pull changes `en.json`, its keys
need notes and matching inline defaults like any other change.

## Exceptions

Mark a deliberate exception, such as the product name, with an
`i18n-ignore: <reason>` comment. The reason is required. A comment at the end of a
line covers that line; a comment on its own line covers the next statement, JSX
element or attribute, however many lines it spans:

```tsx
<h1>
  {/* i18n-ignore: product name, the same in every language */}
  <span>OpenMarch</span>
</h1>
```

The same comment silences the key check for a function named `t` that isn't
Tolgee's. Use it for text that must stay the same in every language, not to skip
work.

## The baseline

Text written before the check is counted per file in
`apps/desktop/i18n-meta/baseline.json`. A file's count may not rise, and when it
falls (you translated text, or deleted the code) the check asks you to run
`pnpm check:i18n --update` so the lower count is locked in. `--update` only lowers
counts and removes entries; it never accepts new problems. The count is per file,
so translating one string doesn't make room for a new one: write the new one with a
key.

When you rename or split a file in the baseline, move its count to the new path by
hand. On a pull request the check compares the baseline with the base branch's: the
counts may move between files, but their total can't rise and `keysWithoutContext`
can't gain keys.

When you touch a file in the baseline, translating its old text is welcome but not
required.
