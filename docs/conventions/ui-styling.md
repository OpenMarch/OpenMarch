# UI Styling

Every surface in the desktop app should look like it came from one hand. New
features drift when they pick their own corner radii, font sizes and paddings, so
match the scale the app already uses and reuse its primitives instead of
restyling them.

The tokens live in `packages/ui/src/tailwind.css` (`@theme`). Tailwind's own
defaults (`rounded-md`, `text-xs`, `p-2` meaning 8 px) do not describe this app.

## Units

- **Spacing is in pixels.** `--spacing` is `0.0625rem`, so `p-8` is 8 px, `gap-12`
  is 12 px and `h-26` is 26 px. `p-2` is 2 px, not 8 px. Write sizes as plain
  numbers (`w-240`, `min-w-180`), not `w-[240px]`.
- Common steps: 2 and 4 inside tight controls, 8 between controls, 12 and 16 inside
  panels, 24 and above between sections.

## Corner radius

| Use                                                                       | Class          |
| ------------------------------------------------------------------------- | -------------- |
| Panels, popovers, menus, tooltips, inputs, selects, toolbar groups, cards | `rounded-6`    |
| Rows inside a menu or list (their highlight), chips and tags in lanes     | `rounded-4`    |
| Buttons, toggle and segmented switches, pills, badges, round handles      | `rounded-full` |
| Large framed media (phone mockups, previews)                              | `rounded-20`   |

- The theme's radii are `rounded-4`, `-6`, `-8`, `-12`, `-16`, `-20`, `-24`, `-32`
  and `-full`. `rounded-2` doesn't exist and silently draws square corners.
- Don't use `rounded-[3px]`, `rounded-md` or bare `rounded`. Lint rejects the
  arbitrary values and Tailwind's default names (`-sm`, `-md`, `-lg` and so on), but
  not bare `rounded`, which older code still uses.
- A box nested inside a bordered rounded box may need the inner radius (outer minus
  border). Keep that as the one exception, with an
  `eslint-disable-next-line no-restricted-syntax -- <why>` comment.

## Font size

| Use                                                                               | Class          |
| --------------------------------------------------------------------------------- | -------------- |
| Body text, menu entries, buttons, inputs, popover titles                          | `text-body`    |
| Secondary text: hints, captions, readouts, footers, menu headings, shortcut notes | `text-sub`     |
| Labels inside timeline and tempo lanes (counts, clip names, lane headings) only   | `text-micro`   |
| Headings and large readouts (Tap tempo's BPM is `text-h3`)                        | `text-h5`–`h1` |

- No `text-[11px]`: lint rejects arbitrary pixel font sizes. 12 px and 13 px are not
  sizes in this app; pick `text-body` or `text-sub`. Tailwind's `text-xs`/`text-sm`
  aren't either, though lint doesn't catch those.
- Show emphasis with weight (`font-medium`, `font-bold`) or color
  (`text-text-subtitle`, `text-accent`), not with another size.
- A tiny picture drawn with text (a time signature in a 16 px icon slot) may keep
  its own size, with an `eslint-disable-next-line` comment saying so.

## Surfaces

Use `apps/desktop/src/components/ui/popupClasses.ts` instead of writing the panel by
hand:

- `POPOVER_CLASS`: a popover's panel (`bg-modal`, `rounded-6`, `border-stroke`,
  `shadow-modal`, `backdrop-blur-32`, `p-12`). Add the layout and width.
- `MENU_CONTENT_CLASS`, `MENU_ITEM_CLASS` (Radix entries), `MENU_BUTTON_CLASS`
  (entries of a menu drawn by hand), `MENU_LABEL_CLASS` and
  `MENU_SEPARATOR_CLASS`: every menu, Radix or hand-drawn, looks the same.
- Tooltips use `TooltipClassName` from `@openmarch/ui`.
- Blur is `backdrop-blur-32`. Don't stack `shadow-lg` on `shadow-modal`.

## Buttons and controls

- Use `Button` from `@openmarch/ui`, or
  `getButtonClassName({ variant, size, content })` when the element must stay a plain `<button>` (a Radix trigger, a
  ref, pointer handlers). Buttons are pills: `primary` for the action that
  commits (Done, Place, Use), `secondary` for the rest, `size: "compact"` (26 px)
  in toolbars and floating bars.
- Don't build a button out of `bg-accent text-text-invert rounded-6 px-10`. Add
  extra classes through `className` so `twMerge` resolves conflicts.
- `twMerge` doesn't know this theme's font sizes: it reads `text-body` and `text-sub`
  as text colors. So the Button's own `text-body` loses to its variant's color and the
  button inherits its parent's size, and a size passed through `className` removes
  the variant's color. Append the size after the merge instead:
  `` `${getButtonClassName({ ... })} text-body` ``.
- Inputs use `Input`/`Select` from `@openmarch/ui`, or their look:
  `rounded-6 border-stroke bg-fg-2 text-body`, 26 px tall when compact.
- Icons come from `@phosphor-icons/react`.

## Colors

Use the theme's colors (`text-text`, `text-text-subtitle`, `bg-fg-1`, `bg-fg-2`,
`bg-modal`, `border-stroke`, `accent`, `red`, `yellow`, `green`) so light and dark
mode both work. Don't use Tailwind palette colors (`bg-white`, `border-gray-200`,
`text-zinc-500`).

## Checking

- `pnpm lint:check` (the `no-restricted-syntax` rule in `.eslintrc.cjs`) rejects
  `text-[<number>...]`, `rounded-[...]` and Tailwind's default radius names in
  `apps/desktop/src` and `packages/ui/src`. It doesn't check spacing, bare `rounded`
  or `text-xs`/`text-sm`; those are on you.
- Put a new surface next to an existing one in a screenshot and compare corners,
  text size and padding. The Inspector, the music file menu and the shape editor bar
  follow this style.
