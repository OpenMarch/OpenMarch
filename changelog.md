# 0.0.5 - Custom Shapes, Mature Installation and Quality of Life Improvements

## New Features

### Custom Shapes

- Shapes are now supported
  - Create a line, curve, or double curve shape
  - This shape can be edited and chained together
- From `0.0.5a` shapes can now be deleted and they are less buggy when adding/deleting segments
- Shapes can be copied to the next and previous page for show continuity

### Temporary Indoor Support

- Indoor fields are now supported in both 6 to 5 and 8 to 5 (ish) steps. In feet:
  - 40x60
  - 50x70
  - 50x80
  - 50x90

> **NOTE** - These fields are temporary solutions.
> A future update will include a tool to create your own custom grid.
> A 6 to 5 step is 30 inches in all of these cases, but an 8 to 5 is a bit more complicated to keep the grid divisible by 4.
>
> Lengths of 40', 60', and 90' have an 8 to 5 step of 22.5". These are the conversions for the other lengths:
>
> - 50' 8 to 5 = 21.429"
> - 70' 8 to 5 = 23.333"
> - 80' 8 to 5 = 21.818"

### Old file compatibility

- You can use files from older versions of the app and they will be converted to the current version
  - You cannot currently use a file from a newer version of OpenMarch on an older version

## Quality of life

- Pages can now be turned into subsets and vice versa
- Timeline progress so it's more obvious what page you're on/going to
  - Some additional styling was applied to make the measures not wrap in a weird way
- Field properties editor is now a modal
- Step sizes are now visible when marcher(s) are selected
- `.mxl` files are now supported
  - Nothing else has been changed about music
- Swap marcher coordinates when two are selected
  - Works with marchers that are assigned to a shape as well
- Marcher coordinates for the next page can be copied to the current page
  - You could already do this with the previous **page**

## Bug Fixes

- PDF exporting now works
  - Only for individual coordinate sheets
  - Use your system's print dialogue for quarter-page sheets
- Changing the counts of a subset no longer turns it into a page
- Marchers being deselected is now reflective in the canvas
- **Shapes from `0.0.5a`**
  - No longer trigger multiple update events when selecting them, messing with undo history
  - Shape editor is now on the correct page at all times
  - Doesn't allow you to add a marcher to multiple shapes on the same page

## Dev

- Many pre-commit hooks and status checks to ensure code quality (thanks Ben)
  - Spellcheck, testing and linting
- Building, signing, notarizing and publishing the app is now automated
