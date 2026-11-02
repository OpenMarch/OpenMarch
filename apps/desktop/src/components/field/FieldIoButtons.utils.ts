import {
    getFieldPropertiesJSON,
    updateFieldsPropertiesJSON,
} from "@/global/classes/FieldProperties";
import { FieldPropertiesSchema } from "./fieldPropertiesSchema";
import { exportableFieldJson, importedFieldJson } from "./fieldFileFloor";
import type { ZodError } from "zod";
import tolgee from "@/global/singletons/Tolgee";

/**
 * Extracts detailed field error messages from Zod validation errors
 * @param error - The Zod error object
 * @returns A user-friendly error message listing specific field issues
 */
function formatZodError(error: ZodError): string {
    const issues = error.issues.map((issue) => {
        const path = issue.path.join(".");
        const field = path || "root";
        return `  • ${field}: ${issue.message}`;
    });

    if (issues.length === 0) {
        return tolgee.t("fieldProperties.errors.unknownValidation");
    }

    return tolgee.t("fieldProperties.errors.fieldsHaveErrors", {
        issues: issues.join("\n"),
    });
}

/**
 * Triggers the file input to open for importing field properties
 * @param fileInputRef - Reference to the hidden file input element
 */
export const handleImport = (
    fileInputRef: React.RefObject<HTMLInputElement | null>,
) => {
    fileInputRef.current?.click();
};

/**
 * Handles the file input change event for importing field properties
 * @param event - The change event from the file input
 * @param fileInputRef - Reference to the hidden file input element
 */
export const handleFileInputChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    fileInputRef: React.RefObject<HTMLInputElement | null>,
) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();

        // Parse JSON - first try-catch block for JSON parsing errors
        let parsedJson;
        try {
            parsedJson = JSON.parse(text);
        } catch (parseError) {
            console.error("JSON parsing error:", parseError);
            alert(tolgee.t("fieldProperties.errors.invalidJson"));
            throw new Error("Invalid JSON file.");
        }

        // Validate with Zod schema - second try-catch block for validation errors
        const result = FieldPropertiesSchema.safeParse(parsedJson);

        if (!result.success) {
            // If validation fails, provide detailed error information
            const errorDetails = formatZodError(result.error);
            console.error("Field properties validation error:", errorDetails);
            alert(
                tolgee.t("fieldProperties.errors.invalidFile", {
                    details: errorDetails,
                }),
            );
            throw new Error(errorDetails);
        }

        // Validation succeeded, proceed with import. The show keeps its own floor (D-23).
        const validatedJson = importedFieldJson(
            result.data,
            await getFieldPropertiesJSON(),
        );

        // Update field properties with validated data
        await updateFieldsPropertiesJSON(validatedJson);

        // Trigger a reload of the field properties to show the import
        window.location.reload();
    } finally {
        // Reset the input so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }
};

/**
 * Handles exporting field properties to a JSON file
 */
export const handleExport = async () => {
    try {
        const jsonStr = exportableFieldJson(await getFieldPropertiesJSON());
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = "field-properties.fieldots";
        document.body.appendChild(a);
        a.click();

        // Cleanup
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error("Error exporting field properties:", error);
    }
};
