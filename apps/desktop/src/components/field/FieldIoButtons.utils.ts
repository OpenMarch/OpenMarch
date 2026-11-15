import {
    getFieldPropertiesJSON,
    updateFieldsPropertiesJSON,
} from "@/global/classes/FieldProperties";
import { FieldPropertiesSchema } from "./fieldPropertiesSchema";
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
 * Reads a `.fieldots` file's text into the field properties JSON to store, or the message to
 * show when it isn't a valid field file.
 */
export function parseFieldFile(
    text: string,
): { ok: true; json: string } | { ok: false; message: string } {
    let parsedJson;
    try {
        parsedJson = JSON.parse(text);
    } catch (parseError) {
        console.error("JSON parsing error:", parseError);
        return {
            ok: false,
            message: tolgee.t("fieldProperties.errors.invalidJson"),
        };
    }

    const result = FieldPropertiesSchema.safeParse(parsedJson);
    if (!result.success) {
        const errorDetails = formatZodError(result.error);
        console.error("Field properties validation error:", errorDetails);
        return {
            ok: false,
            message: tolgee.t("fieldProperties.errors.invalidFile", {
                details: errorDetails,
            }),
        };
    }
    return { ok: true, json: JSON.stringify(result.data) };
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
        const result = parseFieldFile(await file.text());
        if (!result.ok) {
            alert(result.message);
            throw new Error(result.message);
        }
        const validatedJson = result.json;

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
        const jsonStr = await getFieldPropertiesJSON();
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
