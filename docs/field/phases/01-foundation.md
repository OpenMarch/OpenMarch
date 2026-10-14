# Phase 1: Foundation

Pin today's behavior, and get the new field drawing the show behind a dev
switch.

## Tickets

- **#190 ADR 0005 and the work-package plan.** This folder and
  [ADR 0005](../../adr/0005-three-field-renderer.md).
- **#191 Field test API over Fabric.** The read-only field test
  API (see [the plan](../implementation-plan.md#the-field-test-api)) over
  today's Fabric field. The browser scenario helpers and existing scenarios
  switch to it. Behavior doesn't change.
- **#192 Tracer bullet.** A hidden dev switch turns on the React Three Fiber
  field. It draws the field and every marcher and label at the playhead,
  driven by playback and scrubbing, and follows the renderer guard rails.
  Field geometry and marcher positions come from modules shared with the 3D
  View. The field test API gets its second implementation.
- **#206 SVG exports from show data.** Coordinate sheets and drill-chart SVGs
  are generated from show data with no canvas, so exports stop depending on
  Fabric. Dots sit exactly on their coordinates.

## Exit gate

- The scenario suite reads the field only through the field test API, and
  passes on Fabric.
- The same scenarios can be pointed at the new field behind the dev switch,
  even though most fail until phase 2.
- Exports no longer import Fabric.

## Handoff notes

Append notes the next tickets need: file locations, seams, surprises.
