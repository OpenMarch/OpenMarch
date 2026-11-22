# UI polish

The design system lives in `packages/ui`: tokens in `packages/ui/src/tailwind.css`,
primitives in `packages/ui/src/components/base`, and previews of both under
`packages/ui/src/previews` (`pnpm ui dev`). New UI is built from these pieces so it looks
like the rest of OpenMarch. A screen that only looks right on its own is not done.

## Sizes

- **Text** uses the OpenMarch scale only: `text-sub` (11 px), `text-body` (14 px), then
  `text-h5`, `text-h4`, `text-h3`, `text-h2` and `text-h1` for headings. Tailwind's built-in
  sizes (`text-xs`, `text-sm`, ...) are removed in `apps/desktop/src/styles/index.css` and
  fail lint. Body copy, labels, inputs and menu items are `text-body`; `text-sub` is for
  secondary detail beside larger text, never for a whole panel.
- **Icons** (Phosphor) use three sizes: 24 for standalone icons and icon buttons, 18 for
  icons inside controls (select arrows, steppers), 16 for small icons inline with
  `text-body`. Icons people click to choose a tool or shape are 24 so they are easy to see.
- **Fonts** are DM Sans for text and DM Mono for numbers and code (`font-mono`).

## Color and surfaces

- Colors come from the theme tokens: `bg-bg-1`, `bg-fg-1`, `bg-fg-2`, `bg-modal`,
  `border-stroke`, `text-text`, `text-text-subtitle`, `accent`, `red`, `yellow`, `green`.
  Raw Tailwind palette colors (`gray-500`, `amber-600`, `white`) and hex values do not follow
  light and dark mode.
- Choices people pick from (option cards, presets, 3D view settings, toggle tiles) share one
  look: `bg-fg-2 border border-stroke` when not selected, `border-accent` when selected.
- Keyboard shortcuts always render through the shared keycap component
  (`apps/desktop/src/components/ui/Keycaps.tsx`), which takes its colors from the tokens.

## Reuse before building

- Start from the primitives in `packages/ui/src/components/base` (Button, Dialog, Select,
  ListItem, Tabs, ToggleGroup, ...). Lists of things are lists (`ListItem`), with the item's
  name as the main text, not as a subtitle under a heading.
- A new page or panel extends the layout of its neighbors. Settings, for example, keeps the
  launch page's layout instead of introducing its own.

## Motion

Things snap to where they go. A popup that follows the selection, marchers after an edit,
and panels that resize all move to their new place in one frame, so people can predict where
they land. Motion is for showing time (playback) and for appearing and disappearing (a short
fade or `animate-scale-in`, 150 ms or less). Hover and focus changes use `duration-150` on
color only.

## Words

Write UI text like a label on a tool, not like a pitch.

- A button names its action: "Done", "Export", "Add marcher".
- Add a description only when it tells people something the label does not. "Read the user
  guide" needs no subtitle; "Exports coordinate sheets as PDF" earns one.
- One action, one control. When "Edit music" and "Done" would both close a panel, keep
  "Done".
- Help lives in the Get Help popup in the title bar and the user guide. Features stay free of
  their own help panels and tutorials.

## Discoverable and placed where people look

- Anything that can be clicked or right-clicked has a hover state (a background or border
  change), so people can tell it responds before they try.
- Actions live in the menu people expect: exporting is under File → Export. A sidebar or
  launch page can promote a feature by linking to that menu item.
- Search results show why they matched: highlight the matching text in each result.
- Popups and dialogs fit their content: no horizontal scroll bars and no large empty areas.

## Before handoff

Screenshot the new UI next to an existing screen at the same zoom and compare text size,
icon size, colors, spacing and the selected state. Fix any difference you would not be able
to defend to the designer.
