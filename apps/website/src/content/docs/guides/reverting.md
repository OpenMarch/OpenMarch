---
title: "Reverting to a previous version"
description: "How to move back to an older version of OpenMarch"
sidebar:
  order: 101
---

> If something is broken after you update OpenMarch, please let us know on the [Discord](discord.openmarch.com) or by emailing <contact@openmarch.com>
>
> We'll get it fixed as soon as we can!

When you open your `.dots` file in a new version of OpenMarch, a lot happens under the hood to get your file ready for new features and/or applying bug fixes.
Because of this, **files opened in new versions of OpenMarch are almost never backwards compatible**.

Because of this, OpenMarch makes a backup of your `.dots` file before it upgrades it to the newer version.
If you want to revert back to an previous version, you just need to get the file from this backup folder.

## OpenMarch's backup folder

The file will look something like "`backup_{TIMESTAMP}_{ORIGINAL_NAME}.dots`"

E.g. "`into the light.dots`" will be named "`backup_2025-11-16T22-42-59-856Z_into the light.dots`" with the timestamp of when the backup was created in [UTC Time](https://en.wikipedia.org/wiki/Coordinated_Universal_Time).

### Windows

```txt
%localappdata%\OpenMarch\backups
```

or

```txt
C:\Users\{YOUR_USERNAME}\Appdata\Local\OpenMarch\backups
```

### MacOS

```txt
~/Library/Application Support/OpenMarch/backups
```

or

```txt
/Users/{YOUR_USERNAME}/Library/Application Support/OpenMarch/backups
```

### Linux

```txt
~/.local/share/OpenMarch/backups
```

or

```txt
/home/{YOUR_USERNAME}/.local/share/OpenMarch/backups
```

## Open the backed up file

Once you find your backed up `.dots` file, copy it to somewhere you will be able to find.
Then, download the version of OpenMarch that file came from.

> You can find previous releases on our [download page]('/download')

Then, just open that file in the older version.
Everything should work from there!

Again, if you have issues, reach out to us the [Discord](discord.openmarch.com) or by emailing <contact@openmarch.com>.
