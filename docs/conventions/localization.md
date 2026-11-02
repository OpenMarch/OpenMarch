# Localization

The desktop app's text is translated with [Tolgee](https://tolgee.io). Write every
piece of user-facing text through Tolgee as you build, even though only English
ships at first. Translators fill in the other languages later, from the English
text and the context you leave for them.

`pnpm check:i18n` enforces this for `apps/desktop/src`. It runs in `pnpm check:quick`,
in the pre-commit hook when desktop source or i18n files change, and in PR checks.

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
- The Electron main process (`apps/desktop/electron`: menus, native dialogs) and
  `packages/ui`.

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

## Writing translatable strings

- Never build a sentence from pieces (`"Page " + label + " flag"`). Other languages
  reorder words. Use one string with arguments: `"Page {page}'s flag"`.
- Counts use ICU plurals: `"{count, plural, one {# marcher} other {# marchers}}"`.
- Inline elements are tags in the string, rendered with `<T params>`:
  `"zoom out with <keys></keys>"` and
  `<T keyName="…" params={{ keys: () => <Keycaps … /> }} />`. Keyboard shortcuts
  always render as keycaps (see `apps/desktop/AGENTS.md`).
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
