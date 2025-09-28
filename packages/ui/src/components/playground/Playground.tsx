import { Suspense, useState, useEffect } from "react";
import type { ComponentType } from "react";
import { useVariantsStore } from "@korhq/undocs";
import type { VariantOption } from "@korhq/undocs";

interface PlaygroundProps {
    component: string;
    variants?: VariantOption[];
}

export default function Playground({ component, variants }: PlaygroundProps) {
    const [Component, setComponent] = useState<ComponentType<
        Record<string, unknown>
    > | null>(null);
    const [error, setError] = useState<string | null>(null);
    const selectedVariants = useVariantsStore(
        (state) => state.selectedVariants,
    );

    const filename = component;

    // Initialize variants when component mounts or variants change
    useEffect(() => {
        if (variants) {
            useVariantsStore.getState().setVariants(variants);
        }
    }, [variants]);

    useEffect(() => {
        async function loadComponent() {
            try {
                // Clear any previous component and error
                setComponent(null);
                setError(null);

                // Dynamically import the component
                const importedModule = await import(
                    /* @vite-ignore */ `../../previews/${filename}`
                );
                const LoadedComponent = importedModule.default;

                if (!LoadedComponent) {
                    throw new Error(`No default export found in ${filename}`);
                }

                setComponent(() => LoadedComponent);
            } catch (err) {
                console.error("Error loading preview:", err);
                setError(`Failed to load preview: ${filename}`);
            }
        }

        if (filename) {
            void loadComponent();
        }
    }, [filename]);

    if (error) {
        return (
            <div id="unpreview-error" className="text-red-400">
                {error}
            </div>
        );
    }

    if (!Component) {
        return <div id="unpreview-loading">Loading preview...</div>;
    }

    return (
        <Suspense fallback={<div id="unpreview-loading">Loading...</div>}>
            <Component {...selectedVariants} />
        </Suspense>
    );
}
