import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { useTolgee } from "@tolgee/react";
import { useSelectedPage } from "@/context/SelectedPageContext";
import { useCollisionStore } from "@/stores/CollisionStore";
import { useMemo } from "react";
import * as Popover from "@radix-ui/react-popover";
import { WarningIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useCanvasStore } from "@/stores/CanvasStore";
import { Button } from "@openmarch/ui";

export function CollisionsTab() {
    const { selectedPage } = useSelectedPage()!;
    const { currentCollisions } = useCollisionStore();

    const collisionInfo = useMemo(() => {
        return currentCollisions.map((collision) => {
            const [a, b] = collision.label.split(",");
            return {
                ...collision,
                marcher1Label: a,
                marcher2Label: b,
            };
        });
    }, [currentCollisions]);

    // Only show tab when there are collisions
    if (!selectedPage || currentCollisions.length === 0) return null;

    return (
        <div className="flex w-full flex-wrap gap-8">
            <CollisionsToolbar collisionInfo={collisionInfo} />
        </div>
    );
}

function CollisionsToolbar({ collisionInfo }: { collisionInfo: any[] }) {
    const { t } = useTolgee();
    const { zoomToCollisions } = useCanvasStore();

    return (
        <ToolbarSection aria-label={t("toolbar.collisions.collisionsToolbar")}>
            <div className="flex items-center gap-6">
                <WarningIcon size={18} className="text-yellow" />
                <span className="font-medium">
                    {collisionInfo.length} Collision
                    {collisionInfo.length !== 1 ? "s" : ""} Found
                </span>
            </div>
            <Popover.Root>
                <Popover.Trigger className="hover:text-accent flex items-center gap-6 outline-hidden duration-150 ease-out focus-visible:-translate-y-4 disabled:opacity-50">
                    Review
                    <CaretDownIcon size={18} />
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content className="bg-modal text-text rounded-6 shadow-modal backdrop-blur-32 border-stroke z-50 m-8 flex max-w-sm flex-col items-start gap-0 border p-8 select-text">
                        <div className="flex flex-col gap-8">
                            <h4 className="text-h5 leading-none">
                                {collisionInfo.length} Collision
                                {collisionInfo.length !== 1 ? "s" : ""}
                            </h4>
                            <p className="text-body text-text-subtitle">
                                Found {collisionInfo.length} collision
                                {collisionInfo.length !== 1 ? "s" : ""} on the
                                next page
                            </p>

                            <Button size="compact" onClick={zoomToCollisions}>
                                Review
                            </Button>

                            <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto">
                                {collisionInfo.map((collision, index) => (
                                    <div
                                        key={index}
                                        className="rounded-6 border-stroke border p-12 transition-colors hover:bg-white/5"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="text-text text-h5 font-medium">
                                                {collision.marcher1Label} ↔{" "}
                                                {collision.marcher2Label}
                                            </div>
                                            <div className="text-text-subtitle font-mono text-sm">
                                                {collision.distance.toFixed(1)}{" "}
                                                steps
                                            </div>
                                        </div>
                                        <div className="text-text-subtitle text-sm">
                                            Position: ({collision.x.toFixed(1)},{" "}
                                            {collision.y.toFixed(1)})
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Popover.Content>
                </Popover.Portal>
            </Popover.Root>
        </ToolbarSection>
    );
}
