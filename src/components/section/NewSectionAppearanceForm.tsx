import { useState, useEffect } from "react";
import { useSectionAppearanceStore } from "@/stores/SectionAppearanceStore";
import { SECTIONS } from "@/global/classes/Sections";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { Button } from "../ui/Button";
import * as Form from "@radix-ui/react-form";
import { toast } from "sonner";
import { NewSectionAppearanceArgs } from "electron/database/tables/SectionAppearanceTable";
import { SectionAppearanceListContents } from "./SectionAppearanceModal";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerText,
} from "../ui/Select";
import { ColorPicker } from "../ui/ColorPicker";
import { SectionAppearance } from "@/global/classes/SectionAppearance";

export default function NewSectionAppearanceForm() {
    const { setContent } = useSidebarModalStore();
    const { sectionAppearances, fetchSectionAppearances } =
        useSectionAppearanceStore();

    // Form state
    const [section, setSection] = useState<string>("");
    const [fillColor, setFillColor] = useState<string>("rgba(0, 0, 0, 1)");
    const [outlineColor, setOutlineColor] =
        useState<string>("rgba(0, 0, 0, 1)");
    const [shapeType, setShapeType] = useState<string>("circle");
    const [formError, setFormError] = useState<string>("");

    // Get all available sections that don't have an appearance yet
    const availableSections = Object.values(SECTIONS)
        .map((section) => section.name)
        .filter(
            (sectionName) =>
                !sectionAppearances.some(
                    (appearance) => appearance.section === sectionName,
                ),
        )
        .sort();

    // Shape options
    const shapeOptions = ["circle", "square", "triangle"];

    // Reset form
    const resetForm = () => {
        setSection("");
        setFillColor("rgba(0, 0, 0, 1)");
        setOutlineColor("rgba(0, 0, 0, 1)");
        setShapeType("circle");
        setFormError("");
    };

    // Fetch section appearances on mount
    useEffect(() => {
        fetchSectionAppearances();
    }, [fetchSectionAppearances]);

    // Handle form submission
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        // Validate form
        if (!section) {
            setFormError("Please select a section");
            return;
        }

        // Create the new section appearance
        const newAppearance: NewSectionAppearanceArgs = {
            section,
            fill_color: fillColor,
            outline_color: outlineColor,
            shape_type: shapeType,
        };

        try {
            await SectionAppearance.createSectionAppearances([newAppearance]);
            await fetchSectionAppearances();
            resetForm();
            toast.success(`Added style for ${section}`);
            setContent(<SectionAppearanceListContents />);
        } catch (error) {
            setFormError("Failed to create section appearance");
            console.error("Error creating section appearance:", error);
        }
    };

    return (
        <Form.Root className="w-80 flex flex-col gap-6" onSubmit={handleSubmit}>
            <Form.Field name="section">
                <div className="flex items-center justify-between">
                    <Form.Label className="text-body text-text">
                        Section
                    </Form.Label>
                    <Form.Message
                        className="text-sm text-red"
                        match="valueMissing"
                    >
                        Please select a section
                    </Form.Message>
                </div>

                <Select value={section} onValueChange={setSection}>
                    <SelectTriggerText label="Section">
                        {section || "Select a section"}
                    </SelectTriggerText>
                    <SelectContent>
                        {availableSections.map((sectionName) => (
                            <SelectItem key={sectionName} value={sectionName}>
                                {sectionName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Form.Field>

            <Form.Field name="fill_color">
                <Form.Label className="text-body text-text">
                    Fill Color
                </Form.Label>
                <ColorPicker color={fillColor} onChange={setFillColor} />
            </Form.Field>

            <Form.Field name="outline_color">
                <Form.Label className="text-body text-text">
                    Outline Color
                </Form.Label>
                <ColorPicker color={outlineColor} onChange={setOutlineColor} />
            </Form.Field>

            <Form.Field name="shape_type">
                <Form.Label className="text-body text-text">Shape</Form.Label>
                <Select value={shapeType} onValueChange={setShapeType}>
                    <SelectTriggerText label="Shape">
                        {shapeType}
                    </SelectTriggerText>
                    <SelectContent>
                        {shapeOptions.map((shape) => (
                            <SelectItem key={shape} value={shape}>
                                {shape}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </Form.Field>

            {formError && <p className="text-sm text-red">{formError}</p>}

            <div className="mt-4 flex justify-end gap-2">
                <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                        resetForm();
                        setContent(<SectionAppearanceListContents />);
                    }}
                >
                    Cancel
                </Button>
                <Button variant="primary" type="submit">
                    Add Style
                </Button>
            </div>
        </Form.Root>
    );
}
