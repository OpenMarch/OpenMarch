<!-- cspell:ignore typesafe TYPESAFE -->

# Jev equality check (optional)

A judgment layer on top of the conversion corpus (`docs/timeline/phases/06-converter.md`,
P6.6). The numeric comparison is authoritative; this asks Jev, the model behind the
`typesafe_sdk` package, whether the converted show looks the same as page mode.

1. Run the corpus runner on your shows. It copies each file first, so the originals are only
   read, and it writes its report outside the repository:

   ```sh
   cd apps/desktop
   OPENMARCH_CONVERSION_CORPUS="/path/a.dots:/path/b.dots" \
   OPENMARCH_CONVERSION_REPORT=/tmp/conversion-corpus.json \
   pnpm run test:focused src/timeline/__test__/conversionCorpus.test.ts
   ```

2. With `TYPESAFE_API_KEY` set, run this script with [uv](https://docs.astral.sh/uv/):

   ```sh
   cd scripts/timeline/jev-equality
   uv run jev_equality.py /tmp/conversion-corpus.json
   ```

For each show it takes the report's sampled moments (page ends and mid-page beats). For each
moment it sends Jev the page-mode and converted coordinates of the same marchers, in the same
order, and asks whether they form the same formation with every marcher in the same place. It
also sends perturbed controls (an identical copy, one marcher moved, two swapped, the formation
shifted, the formation mirrored), so you can see that Jev tells them apart. It prints agreement
rates with the numeric verdict and writes Jev's answers next to the report.

Only coordinates are sent: no names, file names or ids. By default at most 48 marchers and 6
moments per show are sent (`--max-marchers`, `--samples`, capped at 64 and 12), to keep the
cost small. If the SDK isn't installed, `TYPESAFE_API_KEY` isn't set, or the connection or
authentication fails, the script says so, lists the numeric verdicts and exits 0. Any other
error is raised and the script exits non-zero.

Page mode is compared at the same beat position as the converted show (C-7), so the
millisecond difference on uneven-tempo pages doesn't appear here; the report lists it.
