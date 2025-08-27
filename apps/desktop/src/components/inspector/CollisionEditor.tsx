import { useSelectedPage } from "@/context/SelectedPageContext";
import { useMemo } from "react";
import { InspectorCollapsible } from "./InspectorCollapsible";
import { useCollisionStore } from "@/stores/CollisionStore";
import { useMarcherVisualStore } from "@/stores/MarcherVisualStore";
import { useMarcherStore } from "@/stores/MarcherStore";

const CollisionEditor = () => {
    const { selectedPage } = useSelectedPage()!;
    const { currentCollisions } = useCollisionStore();
    const { marcherVisuals } = useMarcherVisualStore();
    const { marchers } = useMarcherStore();

    const collisionInfo = useMemo(() => {
        return currentCollisions.map((collision) => {
            const [a, b] = collision.label.split(",");
            return {
                ...collision,
                marcher1Label: a,
                marcher2Label: b,
            };
        });
    }, [currentCollisions, marchers, marcherVisuals]);

    if (!selectedPage || currentCollisions.length === 0) return null;

    return (
        <InspectorCollapsible
            defaultOpen
            className="z-50"
            translatableTitle={{
                keyName: "Collisions",
                parameters: { pageNumber: selectedPage.name },
            }}
        >
            <div className="space-y-2">
                <div className="mb-2 text-sm text-gray-600">
                    Found {currentCollisions.length} collision
                    {currentCollisions.length !== 1 ? "s" : ""} on the next
                    page:
                </div>
                {collisionInfo.map((collision, index) => (
                    <div
                        key={index}
                        className="hover:bg-accent/25 rounded-md p-4"
                    >
                        <div className="flex items-center justify-between">
                            <div className="font-medium text-red-800">
                                {collision.marcher1Label} ↔{" "}
                                {collision.marcher2Label}
                            </div>
                            <div className="text-sm text-red-600">
                                Distance: {collision.distance.toFixed(1)}
                            </div>
                        </div>
                        <div className="mt-1 text-xs text-red-600">
                            Position: ({collision.x.toFixed(1)},{" "}
                            {collision.y.toFixed(1)})
                        </div>
                    </div>
                ))}
            </div>
        </InspectorCollapsible>
    );
};

export default CollisionEditor;
