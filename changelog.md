# 0.0.3

## Features

- Lines
  - Users can select a group of 3 or more marchers and draw a straight line
  - This is the start of a new feature called an "Alignment Event." This will be how other shapes are created as well

## Quality of life

- Mac users can double click files in Finder to open them in OpenMarch
  - Users must manually set this by clicking "Choose Application"
  - OpenMarch's logo still doesn't show on the icon for the file
  - Not tested on Windows

## Dev

- Switched from Jest to Vitest
- Reorganized files for the sidebar, topbar, and timeline to have their own folders
  - Sidebar editors now have their own container component `EditorContainer.tsx`
