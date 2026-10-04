# 3D View UI

The 3D View window's look and behavior. It matches the editor: the same
tokens, primitives, icons and Tolgee strings. The reference demo's overlay
([ref/venue-demo.html](ref/venue-demo.html)) is the approved layout. Rebuild it
with `packages/ui` components, not with the demo's CSS.

## UI-1 Opening the window

- In the editor, add "Open 3D View" to the toolbar section that holds view
  controls, with the Phosphor `Cube` icon, and to the app menu's View menu. If
  the window is already open, both focus it.
- The window title is "3D View — <show name>", in the app's `TitleBar`.
- When it opens, it shows the show's venue from the default camera
  (`pressBox`, or `geJudge` for the gym), arriving with the camera's fly-in.

## UI-2 Layout

Everything floats over a full-window canvas.

- **Top left: venue picker.** Shows the kit names: High school, Big high
  school, College bowl, Pro dome, Indoor gym, Field only. Use a segmented
  control when it fits and a Select when the window is narrow. Changing it
  sends a venue-change request. The editor saves it with undo, so Ctrl+Z in the
  editor reverts it.
- **Top right:**
  - lighting presets for the current kit (segmented);
  - Crowd toggle (`Users` icon);
  - Fullscreen (`CornersOut` icon).

  Lighting and crowd are saved with the show, through the same request.

- **Bottom: camera bar.** The kit's named cameras, then "Pick a seat"
  (`Armchair` icon).
- **Bottom left: readout.** Set (page) name and count, from the selection and
  clock. A second line shows eye height and distance to the field center, in
  the field's measurement system (feet or meters).
- **Styling:**
  - Floating panels use the existing overlay pattern (`border-stroke`,
    `bg-modal`, `backdrop-blur-32`, `rounded-6`, `shadow-modal`).
  - Active segments use `accent`.
  - Text is `text-body` and labels are `text-sub`, uppercase and in mono.
  - Both themes work, following the app's theme setting.

## UI-3 Cameras

- **Selecting a camera** flies to it over 1.1 s, ease-in-out, with a small
  upward arc on long moves. With reduced motion, it jumps.
- **Moving freely:**
  - drag to orbit;
  - right-drag or Shift+drag to pan;
  - wheel or pinch to zoom.

  The camera can't go below ground level. Moving manually deselects the camera
  chip.

- **Pick a seat:** shows a crosshair, then clicking a stand moves the camera
  to that seat at a seated eye height (1.2 m above the tread), looking at the
  field center. The mode ends after one pick, or with Esc.
- **When the camera lands**, the crowd within 4.9 m of it is cleared, so a
  seat view isn't blocked by the nearest people.
- **Top-down** matches the 2D canvas orientation: front at the bottom, side 1
  on the left.
- **Keyboard:**
  - 1–9 select cameras in bar order;
  - F toggles fullscreen;
  - C toggles the crowd;
  - Esc cancels pick-a-seat or exits fullscreen.

## UI-4 Following the editor

- Performers move with the editor's playback. When paused, they hold the
  selected page's positions, like the 2D canvas.
- The window has no play controls in the MVP. The editor drives it.
- Selected marchers show an accent ring.
- If the editor closes the show, the window closes.

## UI-5 Fullscreen (projector mode)

- Fullscreen hides the overlay after 3 seconds without pointer movement, and
  shows it again on movement. The readout stays visible, larger, in the
  bottom-left.

## UI-6 Strings

All strings go through Tolgee under `view3d.*`, for example
`view3d.camera.pressBox`, `view3d.kit.pro` and `view3d.lighting.roofClosed`.
Add the English values to `apps/desktop/i18n/en.json`.

## Not in the MVP

The in-editor preview, saved custom views, split views, a camera track,
video export and venue import. Don't build these; they need a decision first.
