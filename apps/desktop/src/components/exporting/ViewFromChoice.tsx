import * as Form from "@radix-ui/react-form";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { T } from "@tolgee/react";
import InfoTip from "@/components/ui/InfoTip";
import type { FieldViewFrom } from "@/field/fieldViewFrom";

/** A pill in an export tab's two-way choice, as the video background choice draws it */
export const EXPORT_TOGGLE_ITEM_CLASS =
    "text-text bg-fg-2 text-body border-stroke data-[state=on]:border-accent touch:min-h-44 flex items-center gap-6 rounded-full border px-12 py-8 outline-hidden duration-150 ease-out focus-visible:-translate-y-4";

/**
 * "View from": the side an export shows the field from, the audience's or the performers'
 * (#1268, #1265). The drill chart and video tabs both use it.
 */
export default function ViewFromChoice({
    value,
    onChange,
    className = "",
}: {
    value: FieldViewFrom;
    onChange: (value: FieldViewFrom) => void;
    className?: string;
}) {
    return (
        <Form.Field
            name="viewFrom"
            className={`flex w-full items-center justify-between gap-12 ${className}`}
        >
            <div className="flex items-center gap-8">
                <Form.Label className="text-body">
                    <T keyName="exportCoordinates.viewFrom" />
                </Form.Label>
                <InfoTip
                    side="top"
                    contentClassName="z-[100000] p-16 max-w-[20rem]"
                    content={<T keyName="exportCoordinates.viewFromTooltip" />}
                />
            </div>
            <ToggleGroup.Root
                type="single"
                value={value}
                onValueChange={(next) => {
                    if (next) onChange(next as FieldViewFrom);
                }}
                className="flex h-fit w-fit gap-8"
            >
                <ToggleGroup.Item
                    value="audience"
                    data-testid="view-from-audience"
                    className={EXPORT_TOGGLE_ITEM_CLASS}
                >
                    <T keyName="exportCoordinates.viewFromAudience" />
                </ToggleGroup.Item>
                <ToggleGroup.Item
                    value="performer"
                    data-testid="view-from-performer"
                    className={EXPORT_TOGGLE_ITEM_CLASS}
                >
                    <T keyName="exportCoordinates.viewFromPerformers" />
                </ToggleGroup.Item>
            </ToggleGroup.Root>
        </Form.Field>
    );
}
