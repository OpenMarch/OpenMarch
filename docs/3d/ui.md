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
show live in the settings panel (UI-7), and graphics choices per computer
in the app's Settings window (UI-9). Revised 2026-10-05,
replacing the first layout's venue and lighting bars and the wide camera bar.

- **Top left: camera.** One menu button (`VideoCamera` icon) names the
  current camera, or "Free view" after orbiting. It lists the kit's named
  cameras with their number keys; choosing the current one again flies back
  to it. "Pick a seat" (`Armchair` icon) sits beside it, in kits with stands.
- **Top right:** Fullscreen (`CornersOut` icon) and View settings (`GearSix`
  icon), which opens the settings panel under them.
- **Bottom left: playback, then the readout.**
  - The editor's Previous, Play and Next, and its playback speed button
    (UI-4).
  - The readout: set (page) name and count, from the selection and clock. A
    second line shows eye height and distance to the field center, in the
    field's measurement system (feet or meters).
- **Bottom right:** a notice, only when the view went to low quality on
  its own (UI-9).
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
  - the viewer picks a control scheme in the View settings panel or Settings >
    3D View, because a
    browser can't reliably tell a mouse wheel from a two-finger scroll
    (owner, 2026-11-09);
  - Orbit, the default (owner, 2026-11-10): drag to orbit; right-drag or
    Shift+drag to pan; scroll to zoom toward the cursor, eased over a few
    frames;
  - Map: drag to pan; Ctrl, Alt (Option), Shift or right-drag to orbit;
    scroll to zoom;
  - Trackpad: scroll or drag to orbit; Shift or right-drag to pan;
  - a pan keeps the ground point under the pointer under it;
  - in all three, a flung orbit coasts to a stop, Ctrl or Alt + drag orbits, Shift
    or Option plus scroll pans, and a pinch zooms toward the cursor; touch
    and pen orbit with one finger, and two fingers pan and pinch;
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
  editor to run its own action (`view3d:playback-request`, ADR 0010 D-4), and
  the window follows the clock and selection the editor then sends. This lets
  a designer present from the 3D View, for example on a projector, without
  reaching for the editor.
- The buttons are the editor's own components
  (`components/timeline/TransportButtons.tsx`, `PlaybackSpeedButton.tsx`), so
  their icons, tooltips and modifier clicks match the editor's exactly:
  Shift+click and Alt+click on Previous and Next step a beat or go to the
  start or end, Shift+click on Play plays from the playhead (or pauses while
  playing), and the speed
  button steps on a click and opens its slider on a right-click. Their
  tooltips are in English, as the editor's are, rather than under `view3d.*`
  (UI-6).
- **Keys**, the editor's own: Space plays, or stops and goes back to where
  Play was pressed; Shift+Space plays from the playhead, or pauses where it
  is; Q and E go to the previous and next page, Shift+Q and Shift+E
  a beat, and Alt+Q and Alt+E (or Home and End) the start and end; ] and [
  held play at double and half speed. Space works even when a window button
  has focus, so a click never steals it; it doesn't apply in text fields or
  an open menu.
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
X, the button again or Esc close it. It has four sections:

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
- **Graphics**: Quality and Resolution live in the app's Settings window
  (UI-9). Where there is no Settings window (the 3D View web preview), this
  section shows them here, with the same hints.
- **Preview only**: horn state, guard equipment and step-off foot, window
  state that is never saved, not even per computer (performer-behavior.md
  section 7.5). Each starts on Follow cues, which draws what the show's
  compiled cues say: Horn/Equipment cues from horns up, each guard
  section's own equipment, and the show's saved step-off foot with Feet
  cues setting their own. Picking a hold holds every carrier in it for the
  whole show; picking a guard piece puts it in every guard member's hands
  (cues still fit by section); picking a foot replaces the show's default
  foot. The section hint says the choices aren't saved and the cues decide.
- **Keyboard and mouse**: every key and pointer gesture the window knows.

## UI-8 Opening with the show

The editor's Settings > General has "Open 3D View when a show opens" (app
setting `view3dAutoOpen`, off by default). When it's on, the editor opens the
window each time it loads a show, including at app launch, without taking
focus from the editor.

## UI-9 Graphics in Settings

The app's Settings window has a **3D View** section for how the window draws
on this computer. Each choice is saved in local storage, which the 3D window
shares, so an open 3D View applies a change as it is saved:

- **Quality**: Automatic (default), Low or High. Automatic starts on High
  and drops to Low once when frames are slow (P5.1). Low and High are fixed.
  The fidelity brief's later Graphics work (Medium, Advanced rows) extends
  this row.
- **Resolution**: the most device pixels drawn per screen pixel: Sharp (2x,
  default), Balanced (1.5x) or Fast (1x). Low quality and battery saving
  draw at 1x whatever this says.
- **Pause drawing when nothing moves** and **Save power on battery**
  (`drawPolicy.ts`), both on by default.

The 3D window says when it went to Low on its own, in a card at the bottom
right that stays until the viewer clicks Got it:

- when Automatic dropped to Low because the view was stuttering, each time,
  saying to choose High in Settings, 3D View (in the web preview: under
  Quality in View settings) to keep full quality;
- when WebGL draws in software (SwiftShader, llvmpipe, Microsoft Basic
  Render), once per computer. The view then always draws at Low, whatever
  Quality says, like the 2D field's low-quality mode, and the card says it
  will still be slow and how to get the GPU back. Only no WebGL at all
  replaces the scene with a message.

## Not in the MVP

The in-editor preview, saved custom views, split views, a camera track,
video export and venue import. Don't build these; they need a decision first.
