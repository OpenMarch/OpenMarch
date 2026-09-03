import { useState, useEffect, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    updatePropsMutationOptions,
    updatePropGeometryWithPropagationMutationOptions,
    propPageGeometryQueryOptions,
    propImagesQueryOptions,
    updatePropImageMutationOptions,
    deletePropImageMutationOptions,
    marcherPagesByPageQueryOptions,
} from "@/hooks/queries";
import {
    Button,
    Input,
    Slider,
    Switch,
    Select,
    SelectContent,
    SelectItem,
    SelectTriggerButton,
} from "@openmarch/ui";
import { SurfaceType, PropWithMarcher } from "@/global/classes/Prop";
import { resolvePropsForPage } from "@/global/classes/propSelectors";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { StaticFormField } from "@/components/ui/FormField";
import { SURFACE_OPTIONS } from "./surfaceOptions";
import { T, useTranslate } from "@tolgee/react";

interface PropEditFormProps {
    prop: PropWithMarcher;
}

const to3Decimals = (n: number) => Math.floor(n * 1000) / 1000;

export default function PropEditForm({ prop }: PropEditFormProps) {
    const { t } = useTranslate();
    const queryClient = useQueryClient();
    const { selectedPage } = useSelectedPage()!;

    const updatePropsMutation = useMutation(
        updatePropsMutationOptions(queryClient),
    );
    const updateGeometryMutation = useMutation(
        updatePropGeometryWithPropagationMutationOptions(queryClient),
    );
    const updateImageMutation = useMutation(
        updatePropImageMutationOptions(queryClient),
    );
    const deleteImageMutation = useMutation(
        deletePropImageMutationOptions(queryClient),
    );

    const { data: allGeometries } = useQuery(propPageGeometryQueryOptions());
    const { data: marcherPages } = useQuery(
        marcherPagesByPageQueryOptions(selectedPage?.id),
    );
    const { data: propImages } = useQuery(propImagesQueryOptions());

    const currentGeometry = useMemo(() => {
        if (!allGeometries || !marcherPages) return null;
        const [resolved] = resolvePropsForPage({
            props: [prop],
            geometries: allGeometries,
            marcherPages,
        });
        return resolved?.geometry ?? null;
    }, [allGeometries, marcherPages, prop]);

    const [name, setName] = useState(prop.marcher.name || "");
    const [surfaceType, setSurfaceType] = useState<SurfaceType>(
        prop.surface_type as SurfaceType,
    );
    const [width, setWidth] = useState(
        to3Decimals(currentGeometry?.width ?? 15),
    );
    const [height, setHeight] = useState(
        to3Decimals(currentGeometry?.height ?? 15),
    );

    const hasImage = useMemo(
        () => propImages?.some((i) => i.prop_id === prop.id) ?? false,
        [propImages, prop.id],
    );
    const [opacityValue, setOpacityValue] = useState(prop.image_opacity);

    useEffect(() => {
        if (currentGeometry) {
            setWidth(to3Decimals(currentGeometry.width));
            setHeight(to3Decimals(currentGeometry.height));
        }
    }, [currentGeometry]);

    useEffect(() => {
        setOpacityValue(prop.image_opacity);
    }, [prop.image_opacity]);

    useEffect(() => {
        setName(prop.marcher.name || "");
        setSurfaceType(prop.surface_type as SurfaceType);
    }, [prop.id, prop.marcher.name, prop.surface_type]);

    const handleOpacityChange = useCallback((values: number[]) => {
        setOpacityValue(values[0]);
    }, []);

    const { mutate: updateProps } = updatePropsMutation;
    const { mutate: updateGeometry } = updateGeometryMutation;
    const handleOpacityCommit = useCallback(
        (values: number[]) => {
            updateProps([{ id: prop.id, image_opacity: values[0] }]);
        },
        [prop.id, updateProps],
    );

    const handleSaveProperties = async () => {
        await updatePropsMutation.mutateAsync([
            {
                id: prop.id,
                name: name || null,
                surface_type: surfaceType,
            },
        ]);
    };

    const handleSurfaceChange = (value: string) => {
        setSurfaceType(value as SurfaceType);
        updatePropsMutation.mutate([
            { id: prop.id, surface_type: value as SurfaceType },
        ]);
    };

    const handleSaveGeometry = async (
        propagation: "current" | "forward" | "all",
    ) => {
        if (!selectedPage) return;
        await updateGeometryMutation.mutateAsync({
            propId: prop.id,
            currentPageId: selectedPage.id,
            changes: { width, height },
            propagation,
        });
    };

    const surfaceLabel =
        SURFACE_OPTIONS.find((o) => o.value === surfaceType)?.labelKey ?? null;

    const isPending =
        updatePropsMutation.isPending ||
        updateGeometryMutation.isPending ||
        updateImageMutation.isPending ||
        deleteImageMutation.isPending;

    return (
        <div className="flex flex-col gap-16">
            {/* Properties */}
            <section className="flex flex-col gap-12">
                <h5 className="text-h5 leading-none">
                    <T keyName="props.edit.properties" />
                </h5>
                <StaticFormField label={t("inspector.prop.name")}>
                    <Input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("props.edit.namePlaceholder")}
                        onBlur={handleSaveProperties}
                    />
                </StaticFormField>
                <StaticFormField label={t("inspector.prop.surface")}>
                    <Select
                        value={surfaceType}
                        onValueChange={handleSurfaceChange}
                    >
                        <SelectTriggerButton
                            label={surfaceLabel ? t(surfaceLabel) : surfaceType}
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
            </section>

            {/* Background Image */}
            <section className="border-stroke flex flex-col gap-12 border-t pt-12">
                <h5 className="text-h5 leading-none">
                    <T keyName="props.edit.backgroundImage" />
                </h5>
                <div className="flex items-center gap-8 px-12">
                    <Button
                        variant="primary"
                        size="compact"
                        disabled={isPending}
                        onClick={() =>
                            document
                                .getElementById(`prop-image-input-${prop.id}`)
                                ?.click()
                        }
                    >
                        {hasImage
                            ? t("props.edit.replaceImage")
                            : t("props.edit.importImage")}
                    </Button>
                    {hasImage && (
                        <Button
                            variant="secondary"
                            size="compact"
                            disabled={isPending}
                            onClick={() => deleteImageMutation.mutate(prop.id)}
                        >
                            <T keyName="props.edit.removeImage" />
                        </Button>
                    )}
                    <input
                        type="file"
                        id={`prop-image-input-${prop.id}`}
                        className="hidden"
                        accept="image/*"
                        onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const raw = new Uint8Array(
                                await file.arrayBuffer(),
                            );
                            updateImageMutation.mutate({
                                propId: prop.id,
                                image: raw,
                            });
                            e.target.value = "";
                        }}
                    />
                </div>
                {hasImage && (
                    <StaticFormField label={t("props.edit.opacity")}>
                        <div className="flex w-full items-center gap-8">
                            <Slider
                                min={0}
                                max={1}
                                step={0.01}
                                value={[opacityValue]}
                                onValueChange={handleOpacityChange}
                                onValueCommit={handleOpacityCommit}
                                aria-label={t("props.edit.opacity")}
                                className="flex-1"
                            />
                            <span className="bg-fg-2 border-stroke rounded-6 min-w-48 shrink-0 border px-8 py-2 text-center font-mono text-xs">
                                {Math.round(opacityValue * 100)}%
                            </span>
                        </div>
                    </StaticFormField>
                )}
            </section>

            {/* Geometry */}
            <section className="border-stroke flex flex-col gap-12 border-t pt-12">
                <h5 className="text-h5 leading-none">
                    Geometry{selectedPage ? ` — ${selectedPage.name}` : ""}
                </h5>
                <StaticFormField label={t("props.form.widthFeet")}>
                    <Input
                        type="number"
                        value={width}
                        onChange={(e) =>
                            setWidth(
                                to3Decimals(parseFloat(e.target.value) || 1),
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
                                to3Decimals(parseFloat(e.target.value) || 1),
                            )
                        }
                        min={1}
                        step={0.5}
                    />
                </StaticFormField>
            </section>

            {/* Apply Geometry Changes */}
            <section className="border-stroke flex flex-col gap-8 border-t pt-12">
                <h5 className="text-h5 leading-none">
                    <T keyName="props.edit.applyChanges" />
                </h5>
                <div className="flex flex-col gap-8 px-12">
                    <Button
                        onClick={() => handleSaveGeometry("forward")}
                        size="compact"
                        disabled={isPending}
                    >
                        <T keyName="props.propagation.forward" />
                    </Button>
                    <Button
                        onClick={() => handleSaveGeometry("current")}
                        variant="secondary"
                        size="compact"
                        disabled={isPending}
                    >
                        <T keyName="props.propagation.current" />
                    </Button>
                    <Button
                        onClick={() => handleSaveGeometry("all")}
                        variant="secondary"
                        size="compact"
                        disabled={isPending}
                    >
                        <T keyName="props.propagation.all" />
                    </Button>
                </div>
            </section>
        </div>
    );
}
