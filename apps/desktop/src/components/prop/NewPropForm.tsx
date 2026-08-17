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
import { SURFACE_OPTIONS } from "./surfaceOptions";
import { T, useTranslate } from "@tolgee/react";

interface NewPropFormProps {
    onSuccess?: () => void;
}

export default function NewPropForm({ onSuccess }: NewPropFormProps) {
    const { t } = useTranslate();
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
            <StaticFormField label={t("inspector.prop.name")}>
                <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("props.form.namePlaceholder")}
                />
            </StaticFormField>
            <StaticFormField label={t("props.form.widthFeet")}>
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
            <StaticFormField label={t("props.form.heightFeet")}>
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
            <StaticFormField label={t("inspector.prop.surface")}>
                <Select
                    value={surfaceType}
                    onValueChange={(v) => setSurfaceType(v as SurfaceType)}
                >
                    <SelectTriggerButton
                        label={
                            SURFACE_OPTIONS.find((o) => o.value === surfaceType)
                                ?.labelKey
                                ? t(
                                      SURFACE_OPTIONS.find(
                                          (o) => o.value === surfaceType,
                                      )!.labelKey,
                                  )
                                : surfaceType
                        }
                    />
                    <SelectContent>
                        {SURFACE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {t(opt.labelKey)}
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
                {createPropsMutation.isPending ? (
                    <T keyName="props.form.creating" />
                ) : (
                    <T keyName="props.form.createProp" />
                )}
            </Button>
        </form>
    );
}
