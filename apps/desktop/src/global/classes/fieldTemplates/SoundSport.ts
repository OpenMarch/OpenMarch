import { FieldProperties } from "@openmarch/core";
import { createIndoorXCheckpoints, createIndoorYCheckpoints } from "./Indoor";

/**
 * SoundSport performance area templates.
 *
 * SoundSport is an outdoor small-ensemble activity. Per the official rules, the
 * performance area is 20 yards deep by 30 yards wide (60 ft x 90 ft) with no
 * interior yard lines and markers every 5 yards around the perimeter.
 *
 * The physical size is fixed, so the two templates below differ only in step
 * size (8-to-5 vs. 6-to-5). We reuse the rectangular grid helpers from the
 * indoor templates to lay out the reference lines.
 *
 * @see https://soundsport.com/rules-faq/
 */
const SoundSportTemplates = {
    // 8 to 5 (22.5-inch steps): 90 ft x 60 ft => 48 x 32 steps
    SOUNDSPORT_8to5: new FieldProperties({
        name: "SoundSport (8 to 5 steps)",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 48 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 32 }),
        stepSizeInches: 22.5,
        isCustom: false,
    }),
    // 6 to 5 (30-inch steps): 90 ft x 60 ft => 36 x 24 steps
    SOUNDSPORT_6to5: new FieldProperties({
        name: "SoundSport (6 to 5 steps)",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 36 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 24 }),
        stepSizeInches: 30,
        isCustom: false,
    }),
} as const;

export default SoundSportTemplates;
