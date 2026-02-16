import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPropsMutationOptions } from "@/hooks/queries";
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import {
    DEFAULT_PROP_WIDTH,
    DEFAULT_PROP_HEIGHT,
    SurfaceType,
} from "@/global/classes/Prop";
import { StaticFormField } from "@/components/ui/FormField";

const SURFACE_OPTIONS: { value: SurfaceType; label: string }[] = [
    { value: "floor", label: "Floor (can march over)" },
    { value: "platform", label: "Platform (can stand on)" },
    { value: "obstacle", label: "Obstacle (blocks movement)" },
];

interface NewPropFormProps {
    onSuccess?: () => void;
}

export default function NewPropForm({ onSuccess }: NewPropFormProps) {
    const queryClient = useQueryClient();
    const createPropsMutation = useMutation(
        createPropsMutationOptions(queryClient),
    );

    const [name, setName] = useState("");
    const [width, setWidth] = useState(DEFAULT_PROP_WIDTH);
    const [height, setHeight] = useState(DEFAULT_PROP_HEIGHT);
    const [surfaceType, setSurfaceType] = useState<SurfaceType>("obstacle");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await createPropsMutation.mutateAsync([
            { name, surface_type: surfaceType, width, height },
        ]);
        setName("");
        onSuccess?.();
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-16">
            <StaticFormField label="Name">
                <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Stage Platform"
                />
            </StaticFormField>
            <StaticFormField label="Width (ft)">
                <Input
                    type="number"
                    value={width}
                    onChange={(e) =>
                        setWidth(
                            parseFloat(e.target.value) || DEFAULT_PROP_WIDTH,
                        )
                    }
                    min={1}
                    step={0.5}
                />
            </StaticFormField>
            <StaticFormField label="Height (ft)">
                <Input
                    type="number"
                    value={height}
                    onChange={(e) =>
                        setHeight(
                            parseFloat(e.target.value) || DEFAULT_PROP_HEIGHT,
                        )
                    }
                    min={1}
                    step={0.5}
                />
            </StaticFormField>
            <StaticFormField label="Surface">
                <Select
                    value={surfaceType}
                    onValueChange={(v) => setSurfaceType(v as SurfaceType)}
                >
                    <SelectTriggerButton
                        label={
                            SURFACE_OPTIONS.find((o) => o.value === surfaceType)
                                ?.label ?? surfaceType
                        }
                    />
                    <SelectContent>
                        {SURFACE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </StaticFormField>

            <Button
                type="submit"
                className="w-full"
                disabled={createPropsMutation.isPending}
            >
                {createPropsMutation.isPending ? "Creating..." : "Create Prop"}
            </Button>
        </form>
    );
}
