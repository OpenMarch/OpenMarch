# 0.0.8 - Performance fixes and error logging

## Additions

- Version checker that automatically notifies you about an update
  - Users can skip version if they wan to
- Automatic error/bug reporting
- Manual bug/feedback reporting
- Filesystem associations
  - Users can now double-click on files to launch them in OpenMarch
- DMG installer background
- Button to close current file and return to launch page
- Tips and tricks sidebar for common issues and fixes

## Fixes

- No longer save the database to the `config.json` file
  - This massively improves performance
- Fixed buggy launch code in electron `index.ts`
