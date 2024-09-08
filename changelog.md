# 0.0.3

## Features

- High school field (in progress)
- Draw and distribute marchers in a line (in progress)

## Quality of life

- Mac users can double click files in Finder to open them in OpenMarch
  - Users must manually set this by clicking "Choose Application"
  - OpenMarch's logo still doesn't show on the icon for the file
  - Not tested on Windows

## Dev

- Switched from Jest to Vitest
- Refactored the Canvas.tsx component to have an accompanying `OpenMarchCanvas.ts` class
  - This will allow for better code isolation, testing, and organization
- Refactoring the database in electron to use class decorators (in progress)
  - Rather than repeating functions in one large file, there will be a generic abstract class called `TableController` that will have common function
