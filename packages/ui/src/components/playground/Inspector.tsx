import type React from "react";
import { useVariantsStore } from "@korhq/undocs";
import type { VariantOption } from "@korhq/undocs";

const Inspector: React.FC = () => {
    const { variants, selectedVariants, setSelectedVariant, resetToDefaults } =
        useVariantsStore();

    const handleVariantChange = (variantTitle: string, value: string) => {
        // Convert value to correct type based on options
        let typedValue: string | boolean | number = value;

        if (value === "true") typedValue = true;
        else if (value === "false") typedValue = false;
        else if (!Number.isNaN(Number(value))) typedValue = Number(value);

        setSelectedVariant(variantTitle, typedValue);
    };

    return (
        <div className="rounded-6 border-stroke bg-fg-1 col-span-1 flex h-full flex-col gap-3 border p-16">
            <h2 className="text-h4 text-text">Inspector</h2>
            <div className="flex flex-col gap-4">
                {variants && variants.length > 0 ? (
                    <>
                        {variants.map((variant: VariantOption) => (
                            <div
                                key={variant.title}
                                className="flex justify-between py-8"
                            >
                                <p className="text-body text-text-subtitle mb-1 block font-mono">
                                    {variant.title}
                                </p>
                                <select
                                    className="w-1/2 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
                                    value={String(
                                        selectedVariants[variant.title] ??
                                            variant.default,
                                    )}
                                    onChange={(e) =>
                                        handleVariantChange(
                                            variant.title,
                                            e.target.value,
                                        )
                                    }
                                >
                                    {variant.options.map((option) => (
                                        <option
                                            key={String(option)}
                                            value={String(option)}
                                        >
                                            {String(option)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ))}

                        <button
                            type="button"
                            onClick={resetToDefaults}
                            className="bg-fg-2 border-stroke rounded-full border px-8 py-4"
                        >
                            Reset to Defaults
                        </button>
                    </>
                ) : (
                    <p className="text-sm text-neutral-400">
                        No variants available for this component
                    </p>
                )}
            </div>
        </div>
    );
};

export default Inspector;
