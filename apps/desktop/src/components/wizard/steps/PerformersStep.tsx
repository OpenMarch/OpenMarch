import { useEffect } from "react";
import { useGuidedSetupStore } from "@/stores/GuidedSetupStore";
import NewMarcherForm from "@/components/marcher/NewMarcherForm";
import { useQuery } from "@tanstack/react-query";
import { allMarchersQueryOptions } from "@/hooks/queries";
import { T } from "@tolgee/react";
import Marcher from "@/global/classes/Marcher";

export default function PerformersStep() {
    const { updatePerformers } = useGuidedSetupStore();
    const { data: marchers } = useQuery(allMarchersQueryOptions());

    // Update wizard state when marchers in database change
    // Convert Marcher objects to NewMarcherArgs format for wizard state
    useEffect(() => {
        if (marchers) {
            const marcherArgs = marchers.map((marcher: Marcher) => ({
                section: marcher.section,
                drill_prefix: marcher.drill_prefix,
                drill_order: marcher.drill_order,
            }));
            updatePerformers({ marchers: marcherArgs });
        }
    }, [marchers, updatePerformers]);

    // Get display name for a marcher (just the drill number)
    const getMarcherDisplayName = (marcher: Marcher): string => {
        return marcher.drill_number;
    };

    return (
        <div className="flex flex-col gap-16">
            <div className="flex flex-col gap-8">
                <h5 className="text-h5">
                    <T keyName="wizard.performers.added" />
                </h5>
                {!marchers || marchers.length === 0 ? (
                    <p className="text-body text-text/60">
                        <T keyName="wizard.performers.noneAdded" />
                    </p>
                ) : (
                    <div className="flex max-h-[200px] flex-col gap-8 overflow-y-auto">
                        {marchers.map((marcher: Marcher) => (
                            <div
                                key={marcher.id}
                                className="rounded-6 border-stroke bg-fg-1 flex items-center border p-12"
                            >
                                <span className="text-body">
                                    {getMarcherDisplayName(marcher)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="border-stroke border-t pt-16">
                <h5 className="text-h5 mb-16">
                    <T keyName="wizard.performers.addNew" />
                </h5>
                <NewMarcherForm disabledProp={false} />
            </div>
        </div>
    );
}
