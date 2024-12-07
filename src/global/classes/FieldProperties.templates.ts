import FootballTemplates from "./fieldTemplates/Football";
import IndoorTemplates from "./fieldTemplates/Indoor";

const FieldPropertiesTemplates = {
    ...FootballTemplates,
    ...IndoorTemplates,
} as const;

export default FieldPropertiesTemplates;
