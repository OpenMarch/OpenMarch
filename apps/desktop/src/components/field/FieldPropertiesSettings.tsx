import FieldPropertiesSelector from "./FieldPropertiesSelector";
import FieldPropertiesCustomizer from "./FieldPropertiesCustomizer";
import FieldIoButtons from "./FieldIoButtons";
import { FieldProperties } from "@openmarch/core";
import { T } from "@tolgee/react";
import { Button } from "@openmarch/ui";
import {
    fieldPropertiesQueryOptions,
    updateFieldPropertiesMutationOptions,
} from "@/hooks/queries";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function FieldPropertiesSettings() {
    const queryClient = useQueryClient();
    const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
    const { mutate: setFieldProperties } = useMutation(
        updateFieldPropertiesMutationOptions(queryClient),
    );

    if (!fieldProperties)
        return (
            <div>
                <T keyName="fieldProperties.errors.noPropertiesToLoad" />
            </div>
        );

    return (
        <div className="flex h-full flex-col overflow-y-auto pb-16">
            <div className="flex w-full min-w-0 flex-col gap-16">
                <h4 className="text-h5 leading-none">
                    <T keyName="fieldProperties.general" />
                </h4>
                <div className="flex flex-col gap-16">
                    <div className="m-8">
                        <FieldIoButtons />
                    </div>
                </div>

                <div className="flex w-full min-w-0 flex-col gap-16">
                    <h4 className="text-h5 leading-none">
                        <T keyName="fieldProperties.customization" />
                    </h4>
                    <FieldPropertiesSelector />
                    {fieldProperties?.isCustom ? (
                        <FieldPropertiesCustomizer />
                    ) : (
                        <Button
                            onClick={() => {
                                setFieldProperties(
                                    new FieldProperties({
                                        ...fieldProperties,
                                        isCustom: true,
                                    }),
                                );
                            }}
                            size="compact"
                            className="w-fit self-end"
                            variant="secondary"
                        >
                            <T keyName="fieldProperties.customize" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
