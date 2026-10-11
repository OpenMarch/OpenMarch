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

Everything floats over a full-window canvas. The scene gets the space: only
the controls used while watching stay on screen, and choices made once per
show or per computer live in the settings panel (UI-7). Revised 2026-10-05,
replacing the first layout's venue and lighting bars and the wide camera bar.

- **Top left: camera.** One menu button (`VideoCamera` icon) names the
  current camera, or "Free view" after orbiting. It lists the kit's named
  cameras with their number keys; choosing the current one again flies back
  to it. "Pick a seat" (`Armchair` icon) sits beside it, in kits with stands.
- **Top right:** Fullscreen (`CornersOut` icon) and View settings (`GearSix`
  icon), which opens the settings panel under them.
- **Bottom left: playback, then the readout.**
  - Previous page, Play or Pause, Next page (UI-4).
  - The readout: set (page) name and count, from the selection and clock. A
    second line shows eye height and distance to the field center, in the
    field's measurement system (feet or meters).
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
  - drag to orbit; a flung drag coasts to a stop;
  - right-drag or Shift+drag to pan; the ground point under the pointer
    stays under it;
  - mouse wheel to zoom toward the cursor, eased over a few frames;
  - on a trackpad: two-finger scroll orbits, Shift or Option plus scroll
    pans, pinch zooms toward the cursor (owner, 2026-10-09: the controls
    should feel good on a trackpad and a mouse alike);
  - zooming works as in CAD tools (owner, 2026-10-09): the camera and the
    orbit center scale about the point under the cursor (the nearest
    performer, else the ground, else a point at the orbit's distance), so
    that point stays put on screen and the view keeps its angle. It goes
    right up to the point, stopping 0.3 m short, and the orbit center comes
    along, so orbiting afterward turns about what you zoomed into. The near
    plane follows the distance in, down to 5 cm, so a close-up isn't
    clipped;
  - double-click to move the orbit center to the clicked spot.

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
  - 1–9 select cameras in menu order;
  - F toggles fullscreen;
  - C toggles the crowd;
  - Esc cancels pick-a-seat, else closes the settings panel, else exits
    fullscreen.

## UI-4 Following the editor

- Performers move with the editor's playback. When paused, they hold the
  selected page's positions, like the 2D canvas.
- The editor owns playback. The window's playback buttons and keys ask the
  editor to run its own action (`view3d:playback-request`, ADR 0002 D-4), so
  they behave exactly like the editor's timeline buttons, including being
  disabled while playing or at the first or last page. The window follows the
  clock and selection the editor then sends. This lets a designer present
  from the 3D View, for example on a projector, without reaching for the
  editor.
- **Keys**, the editor's own: Space plays or pauses; Q and E go to the
  previous and next page; Shift+Q and Shift+E go to the first and last page.
  Space works even when a window button has focus, so a click never steals
  it; it doesn't apply in text fields or an open menu.
- Selected marchers show an accent ring.
- If the editor closes the show, the window closes.

## UI-5 Fullscreen (projector mode)

- Fullscreen hides the overlay after 3 seconds without pointer movement, and
  shows it again on movement. It doesn't hide while the settings panel is
  open. The readout stays visible, larger, in the bottom-left.

## UI-6 Strings

All strings go through Tolgee under `view3d.*`, for example
`view3d.camera.pressBox`, `view3d.kit.pro` and `view3d.lighting.roofClosed`.
Add the English values to `apps/desktop/i18n/en.json`.

## UI-7 Settings panel

The View settings button opens a panel at the top right, under the button.
It doesn't block the scene, so the viewer can orbit while trying a look; the
X, the button again or Esc close it. It has three sections:

- **This show**: the venue, saved in the show file and undoable in the
  editor (the hint says so):
  - the venue kits, two per row;
  - the kit's lighting presets;
  - in kits with stands: a Crowd switch and, while the crowd shows, the
    home and visitors colors it wears (`params.homeColor`, `awayColor`);
  - except in the gym: the end-zone lettering and its color
    (`params.endZoneText`, `endZoneColor`). The text saves on Enter or when
    focus leaves, and each color when its picker closes, so one edit is one
    undo step. Empty text means no lettering.
- **This computer**: graphics, saved in the window's local storage, never
  in the show. Quality is Automatic (default), Low or High. Automatic starts on
  High and drops to Low once when frames are slow (P5.1); a hint then says
  so. Low and High are fixed. The fidelity brief's later Graphics work
  (Medium, Advanced rows) extends this section.
- **Keyboard and mouse**: every key and pointer gesture the window knows.

## UI-8 Opening with the show

The editor's Settings > General has "Open 3D View when a show opens" (app
setting `view3dAutoOpen`, off by default). When it's on, the editor opens the
window each time it loads a show, including at app launch, without taking
focus from the editor.

## Not in the MVP

The in-editor preview, saved custom views, split views, a camera track,
video export and venue import. Don't build these; they need a decision first.
