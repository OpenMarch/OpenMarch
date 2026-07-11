import FootballTemplates from "./fieldTemplates/Football";
import GridFieldTemplates from "./fieldTemplates/GridFields";

const FieldPropertiesTemplates = {
    ...FootballTemplates,
    ...GridFieldTemplates,
} as const;

export default FieldPropertiesTemplates;
