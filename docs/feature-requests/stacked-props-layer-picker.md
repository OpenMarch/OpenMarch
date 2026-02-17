# Feature Request: Stacked Props Layer Picker

**Status:** Request  
**Labels:** enhancement, canvas, props

---

## Problem

When multiple props are placed on top of each other, clicking the stack always selects only the topmost prop. There is no way to select a prop that is underneath without changing z-order or moving props, which is frustrating when editing or inspecting overlapping props.

## Proposed Solution

When the user clicks on a point where **two or more props overlap**, show a small **floating picker near the cursor** that lists each prop at that point (top to bottom). The user can click the prop they want to select from the list. After a choice, the picker closes and that prop becomes selected.

- **Single prop at point:** Behavior stays as today (direct selection, no picker).
- **Scope:** Props only for the initial version; the same pattern could later support marchers or mixed stacks.

## Desired Behavior

1. User clicks on a stack of overlapping props.
2. A compact floating UI appears near the mouse (e.g. slightly offset so it isn’t under the cursor).
3. The list shows each overlapping prop in order (top layer first), with a recognizable label (e.g. prop name, drill number, or “Prop N”).
4. User clicks one entry → that prop is selected, picker closes.
5. Clicking outside the picker or pressing Escape closes the picker without changing selection.

## Acceptance Criteria

- [ ] Clicking a point where 2+ props overlap opens a picker near the cursor.
- [ ] Picker lists all props at that point (top-to-bottom) with identifiable labels.
- [ ] Choosing an entry selects that prop and closes the picker.
- [ ] Single prop at point: no picker, normal direct selection.
- [ ] Picker can be dismissed via outside click or Escape without changing selection.

## Optional Implementation Notes

- Canvas already uses Fabric.js; “objects at point” can be computed with the pointer in scene coordinates and `containsPoint(pointer, null, true)` on each prop, iterating top-to-bottom.
- When multiple props are detected, cancel the default topmost selection and show the picker; on pick, set the canvas active object to the chosen prop so existing selection/context flows (e.g. SelectedMarchersContext) stay in sync.
- A small Zustand store (or similar) can hold picker state (open/position/options); a React component in the canvas area can render the floating list and call back to apply selection and close.
