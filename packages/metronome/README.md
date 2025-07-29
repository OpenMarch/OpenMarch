# Metronome

A Metronome audio file generation utility for the OpenMarch project.

Given a list of `Measure`(s), the package extracts the beats and generates
an audio buffer with clicks at every `Beat`'s `timestamp`.

There are four main files in this package:

- metronome.ts: Contains `createMetronomeWav`, which generates audio files.
- tone_creator.ts: Utility functions for creating tones.
- tones.ts: A list of tones used in the metronome. **Add new tones here!**
- utils.ts & node-utils.ts: Utility functions for the package.

## Creating New Tones

To create a new tone, add it to the _`tones.ts`_ file with the following steps:

- First, define the name of the tone, and add it to `BEAT_STYLE_IDS`.
- Then, create two new tone functions, one for beats, and one for measures.
  - Several utilities are provided to help you create tones, including
    `generateOscillator`, `mixSamples`, `padSamples` and `applyFade`. - For an example, see `_beatClickDefault`.
- Finally, export memoized versions of the tones, and add them to `BEAT_STYLE_FUNCTIONS`.
- These functions are now accessible in the main OpenMarch app.
  - Make sure you map the tone to a frontend text with `BEAT_STYLE_LABELS` in `MetronomeModal.tsx`.

## Development

1. Ensure you have [Node](https://nodejs.org/en/download) installed
1. [pnpm](https://pnpm.io/installation) is optional but recommended
1. Install dependencies

   ```bash
   pnpm install
   ```
