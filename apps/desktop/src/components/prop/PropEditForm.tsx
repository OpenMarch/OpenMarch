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
import { useSelectedPage } from "@/context/SelectedPageContext";
import { StaticFormField } from "@/components/ui/FormField";

interface PropEditFormProps {
    prop: PropWithMarcher;
}

const SURFACE_OPTIONS: { value: SurfaceType; label: string }[] = [
    { value: "floor", label: "Floor (can march over)" },
    { value: "platform", label: "Platform (can stand on)" },
    { value: "obstacle", label: "Obstacle (blocks movement)" },
];

export default function PropEditForm({ prop }: PropEditFormProps) {
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
        const marcherPage = Object.values(marcherPages).find(
            (mp) => mp.marcher_id === prop.marcher_id,
        );
        if (!marcherPage) return null;
        return allGeometries.find((g) => g.marcher_page_id === marcherPage.id);
    }, [allGeometries, marcherPages, prop.marcher_id]);

    const [name, setName] = useState(prop.marcher.name || "");
    const [surfaceType, setSurfaceType] = useState<SurfaceType>(
        prop.surface_type as SurfaceType,
    );
    const [width, setWidth] = useState(currentGeometry?.width ?? 15);
    const [height, setHeight] = useState(currentGeometry?.height ?? 15);
    const [visible, setVisible] = useState(currentGeometry?.visible ?? true);

    const hasImage = useMemo(
        () => propImages?.some((i) => i.prop_id === prop.id) ?? false,
        [propImages, prop.id],
    );
    const [opacityValue, setOpacityValue] = useState(prop.image_opacity);

    useEffect(() => {
        if (currentGeometry) {
            setWidth(currentGeometry.width);
            setHeight(currentGeometry.height);
            setVisible(currentGeometry.visible);
        }
    }, [currentGeometry]);

    useEffect(() => {
        setOpacityValue(prop.image_opacity);
    }, [prop.image_opacity]);

    const handleOpacityChange = useCallback((values: number[]) => {
        setOpacityValue(values[0]);
    }, []);

    const { mutate: updateProps } = updatePropsMutation;
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
            changes: { width, height, visible },
            propagation,
        });
    };

    const isPending =
        updatePropsMutation.isPending ||
        updateGeometryMutation.isPending ||
        updateImageMutation.isPending ||
        deleteImageMutation.isPending;

    return (
        <div className="flex flex-col gap-16">
            {/* Properties */}
            <section className="flex flex-col gap-12">
                <h5 className="text-h5 leading-none">Properties</h5>
                <StaticFormField label="Name">
                    <Input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Prop name"
                        onBlur={handleSaveProperties}
                    />
                </StaticFormField>
                <StaticFormField label="Surface">
                    <Select
                        value={surfaceType}
                        onValueChange={handleSurfaceChange}
                    >
                        <SelectTriggerButton
                            label={
                                SURFACE_OPTIONS.find(
                                    (o) => o.value === surfaceType,
                                )?.label ?? surfaceType
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
            </section>

            {/* Background Image */}
            <section className="border-stroke flex flex-col gap-12 border-t pt-12">
                <h5 className="text-h5 leading-none">Background Image</h5>
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
                        {hasImage ? "Replace Image" : "Import Image"}
                    </Button>
                    {hasImage && (
                        <Button
                            variant="secondary"
                            size="compact"
                            disabled={isPending}
                            onClick={() => deleteImageMutation.mutate(prop.id)}
                        >
                            Remove
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
                    <StaticFormField label="Opacity">
                        <div className="flex w-full items-center gap-8">
                            <Slider
                                min={0}
                                max={1}
                                step={0.01}
                                value={[opacityValue]}
                                onValueChange={handleOpacityChange}
                                onValueCommit={handleOpacityCommit}
                                aria-label="Image opacity"
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
                <StaticFormField label="Visible">
                    <Switch checked={visible} onCheckedChange={setVisible} />
                </StaticFormField>
                <StaticFormField label="Width (ft)">
                    <Input
                        type="number"
                        value={width}
                        onChange={(e) =>
                            setWidth(parseFloat(e.target.value) || 1)
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
                            setHeight(parseFloat(e.target.value) || 1)
                        }
                        min={1}
                        step={0.5}
                    />
                </StaticFormField>
            </section>

            {/* Apply Geometry Changes */}
            <section className="border-stroke flex flex-col gap-8 border-t pt-12">
                <h5 className="text-h5 leading-none">Apply Changes</h5>
                <div className="flex flex-col gap-8 px-12">
                    <Button
                        onClick={() => handleSaveGeometry("forward")}
                        size="compact"
                        disabled={isPending}
                    >
                        This page forward
                    </Button>
                    <Button
                        onClick={() => handleSaveGeometry("current")}
                        variant="secondary"
                        size="compact"
                        disabled={isPending}
                    >
                        This page only
                    </Button>
                    <Button
                        onClick={() => handleSaveGeometry("all")}
                        variant="secondary"
                        size="compact"
                        disabled={isPending}
                    >
                        All pages
                    </Button>
                </div>
            </section>
        </div>
    );
}
