import { FieldProperties } from "@openmarch/core";
import { createIndoorXCheckpoints, createIndoorYCheckpoints } from "./Indoor";

/** SoundSport performance area: 20 yards deep by 30 yards wide. @see https://soundsport.com/rules-faq/ */
const SoundSportTemplates = {
    // 8 to 5 (22.5"): 90 x 60 ft => 48 x 32 steps
    SOUNDSPORT_8to5: new FieldProperties({
        name: "SoundSport - 8 to 5 steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 48 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 32 }),
        stepSizeInches: 22.5,
        isCustom: false,
    }),
    // 6 to 5 (30"): 90 x 60 ft => 36 x 24 steps
    SOUNDSPORT_6to5: new FieldProperties({
        name: "SoundSport - 6 to 5 steps",
        xCheckpoints: createIndoorXCheckpoints({ xSteps: 36 }),
        yCheckpoints: createIndoorYCheckpoints({ ySteps: 24 }),
        stepSizeInches: 30,
        isCustom: false,
    }),
} as const;

export default SoundSportTemplates;
