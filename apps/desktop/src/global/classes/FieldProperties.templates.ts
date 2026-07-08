import FootballTemplates from "./fieldTemplates/Football";
import IndoorTemplates from "./fieldTemplates/Indoor";
import SoundSportTemplates from "./fieldTemplates/SoundSport";

const FieldPropertiesTemplates = {
    ...FootballTemplates,
    ...IndoorTemplates,
    ...SoundSportTemplates,
} as const;

export default FieldPropertiesTemplates;
