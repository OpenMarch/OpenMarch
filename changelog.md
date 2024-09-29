# 0.0.3 - Alignment

## Features

- **Lines**
  - Steps to create a line:
    1. Select a group of 3 or more marchers
    1. Click the `Draw Line` button in the marcher editor or press `L`
    1. Draw a straight line
    1. Adjust the order the Marchers will be on the line by dragging them around
    1. Press `Apply` in the alignment editor or `Enter` to apply the changes
  - This is the start of a new feature called an "Alignment Event." This will be how other shapes are created as well
- **High school field (in progress)**

## Quality of life

- **Mac users can double click files in Finder to open them in OpenMarch**
  - Users must manually set this by clicking "Choose Application"
  - OpenMarch's logo still doesn't show on the icon for the file
  - Not tested on Windows

## Dev

- **Switched from Jest to Vitest**
  - This simplifies the config files needed (since we're already using Vite) and the tests are a lot faster
  - The VSCode extension is not too polished in comparison to Jest unfortunately
- **Reorganized files for the sidebar, topbar, and timeline to have their own folders**
  - Sidebar editors now have their own container component `EditorContainer.tsx`
- **There is now a `Selectable` interface to select more than just marchers on the canvas**
  - Originally, this was for MarcherLines, but I decided for now to not make them editable. This will greatly simplify the code and users can just cancel and create a new line
  - This will be useful (hopefully) when props and non-marcher objects are implemented
- **There is now an abstract class for database tables in electron `TableController.ts`**
  - This will make adding new tables to OpenMarch much easier
  - Rather than repeating functions in one large file, there will be a generic abstract class called `TableController` that will have common functions
  - This was also originally used for MarcherLines when I wanted them to be their own separate objects, but I decided against that
  - I want to transition all of the existing tables to this if I can find a way to do it easily
  - I haven't figured out history in this abstract class yet
- **Refactored the Canvas.tsx component to have an accompanying `OpenMarchCanvas.ts` class**
  - This will allow for better code isolation, testing, and organization
- **Made a way to switch the listeners on the canvas based on the `AlignmentEvent`**
  - `CanvasListeners` are a way to change the default behavior of the canvas. 
  - All `CanvasListeners` should extend the `DefaultListeners` so that default functionality can easily be implemented with `super`
