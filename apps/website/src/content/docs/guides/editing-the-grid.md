---
title: "Editing the Field"
description: "How to adjust the field or grid in OpenMarch to meet your ensemble's needs"
sidebar:
  order: 3
---

OpenMarch allows designers to make their own field with whatever measurements and specifications they want, as long as it's a rectangle.
Designers can write for football field, indoor floors, or any other rectangular performance surface.

> Note that in this guide, "field" and "grid" are used interchangeably.

## Choosing a template

To start, pick a template that is closest to your use case. The available templates as of 0.0.7 are:

- Football fields
  - 8-to-5 step (22.5 inches)
  - High school, NCAA and Pro
  - With or without endzones
- Indoor floors
  - 24 inch and 30 inch (6-to-5) step sizes
  - Height x width in feet
    - 40x60
    - 50x70
    - 50x80
    - 50x90

Once you pick a template, click "Apply Field Type".
If the template works for your use case, you can start writing your show.
If you need to modify it, you can click "Customize" to make changes to the field.

![Editing field example](/docs/guides/field/editing.gif)

## Importing and Exporting Fields

OpenMarch can save your custom field as a `.fielddots` file.

- Any background image imported _will not_ be saved in the `.fielddots` file
- The field is not saved to a file automatically and must be exported manually if you want to use it in other shows
  - This also includes any changes you make to the field after exporting it
- For you hackers, this is just a JSON file with a `.fielddots` extension
  - You can poke around with it, but there isn't much you can edit that you can't in the UI

## General Values and Settings

- **Field Name**
  - The name of the field
    - E.g. "NCAA Football Field with Endzones" or "BRHS 2016 Indoor Floor"
  - This is purely for the you to identify the field and does not perform any function
- **Step Size**
  - In inches or centimeters, the real-life size of the step the grid is based on
    - Note that if you switch to imperial or metric, the measurement of the field will follow that system
    - You can switch back and forth without any change or issues. OpenMarch will automatically convert the field measurements to the new system
  - The "pixels per inch" in OpenMarch is constant, so adjusting this will ensure that the dots are always the correct size across different sized grids and fields
  - In the future, this will also be used to calculate marcher step size with multiple measurement systems
- **Half line interval**
  - The interval to render the darker "half lines" at from the center and front of the field
  - This is purely a visual aid and does not affect the coordinates
  - To have no half lines, this can be set to 0

## Image Rendering

- **Import Image**
  - Import a background image to render on the field
    - Must be one of the following: `[jpg, jpeg, png, gif, bmp, webp]`
  - This will _not_ be saved in the `.fielddots` file when you export the field
- **Show Background Image**
  - Whether or not to render the background image (if one is imported)
  - This can be toggled on and off without affecting the field and the image will remain in the project until toggled back on
- **Conform Method** (Fill or Fit)
  - Fill the background image and overflow over the edges
    - ![Filled field](/docs/guides/field/image-11.png)
  - Fit the image to the field having a bit of padding
    - ![Fit field](/docs/guides/field/image-10.png)

## Checkpoints

The "checkpoints" of a grid are the reference points that are used to determine a marcher's coordinates.

![Field dimensions stats](/docs/guides/field/image-1.png)

The Following are the same for both X and Y checkpoints:

- **Name**
  - The long name of the checkpoint
    - E.g. "45 Yard Line" or "High School Front Hash"
    - **Note** - you do not need to include "Side 1" or "Side 2" in the name
  - This should be verbose and descriptive
  - Optionally, this may be displayed on the individual coordinate sheets for PDF exports
- **Short Name**
  - A terse abbreviation of the name
    - E.g. "50" or "FH"
  - This is what will be displayed on the external labels of the grid
    - ![Yard line external labels using short names](/docs/guides/field/image-4.png)
    - ![Hash external labels using short names](/docs/guides/field/image-5.png)
  - This will be displayed as the coordinates in the marcher editor
    - ![Marcher editor showing short names](/docs/guides/field/image-6.png)
  - Optionally, this may also be displayed on the individual coordinate sheets for PDF exports
- **Field Label**
  - _Currently unfinished_
  - On existing football field grids, the label to print on the field, potentially as a coordinate reference
- **Visible**
  - Whether or not the checkpoint is visible on the grid
  - If false, the checkpoint (or its labels) will not be rendered on the grid
  - Non-visible checkpoints may still be used as a reference
- **Use as Reference**
  - Whether or not this checkpoint should be used as a reference when generating coordinates
  - This is useful for things like "real hash" vs "grid hash" where there is a point you want on the field for visualization, but don't want the coordinates to reference it

### X Checkpoints

Coordinates on the X-axis, e.g. yard lines.

- Determined by the steps from the center of the field
  - Director's left is negative steps. Right is positive
  - E.g. in an 8-to-5 football field:
    - 50 yard line = 0 steps
    - 40 S1 = -16 steps
    - 35 S2 = 24 steps
- The distance of the minimum and maximum X-Checkpoints determines the width of the field
  - These _must_ be equidistant from the center. If not, strange graphical things may happen and OpenMarch will warn you
  - E.g. in an 8-to-5 football field with no endzones:
    - 0 S1 = -80 steps
    - 0 S2 = 80 steps
    - Total length = 160 steps
  - ![Width stats](/docs/guides/field/image-3.png)
- There does not need to be a center checkpoint (0 steps)
  - Whether there is or not, the coordinates will be calculated relative to the center

### Y Checkpoints

Coordinates on the Y-axis, e.g. hashes.

- Using hashes
  - ![Hash switch UI](/docs/guides/field/image-7.png)
  - If checked, the Y-checkpoints will appear as thick and short lines on the grid
    - ![Field with hashes](/docs/guides/field/image-8.png)
  - If not, the Y-checkpoints will appear as thin and long lines on the grid (like the X-checkpoints)
    - ![Field without hashes](/docs/guides/field/image-9.png)
- Determined by the steps from the front of the field
- The most negative Y-Checkpoint determines the height of the field
  - The steps should _always_ be negative with 0 being the front. If not, strange graphical things may happen and OpenMarch will warn you
  - E.g. on a 50 foot tall floor with a step size of 24 inches
    - Front line = 0 steps
    - Back line = -25 steps
    - Total height = 25 steps
      - `25 (24-inch) steps = 50 feet`
    - ![Height stats](/docs/guides/field/image-13.png)
- There does not need to be a front checkpoint (0 steps)
  - Whether there is or not, the coordinates will be calculated relative to the front

## Side Descriptions

Customize the description of the left and right side of the field to fit your ensemble's needs.

- Default is "Side 1" and "Side 2"
- The abbreviation is used in the marcher editor and optionally in the coordinate sheets for PDF exports

## Field Labels

This is unfinished, read-only, and only works for provided football fields.

## External Labels

Toggle on and off the external labels for each side of the field.
This is purely cosmetic and does not affect the coordinates.

## Theme

Adjust the color of most elements of the grid.

> Customizing color for specific sections and individual marchers is coming

Colors can easily reset to the system default by either clicking the return arrow for that specific property, or the `Reset Theme to Default` button.

![Theme palette](/docs/guides/field/image-12.png)
