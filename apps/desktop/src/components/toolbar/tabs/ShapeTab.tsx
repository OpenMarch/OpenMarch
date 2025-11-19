import { RegisteredActionsObjects } from "@/utilities/RegisteredActionsHandler";
import {
    CircleIcon,
    LineSegmentIcon,
    PentagonIcon,
    SquareIcon,
} from "@phosphor-icons/react";
import RegisteredActionButton from "@/components/RegisteredActionButton";
import ToolbarSection from "@/components/toolbar/ToolbarSection";
import { useTolgee } from "@tolgee/react";

export default function ShapeTab() {
    const { t } = useTolgee();

    return (
        <div className="flex w-full flex-wrap gap-8">
            <ToolbarSection
                aria-label={t("toolbar.shape.shapesAriaLabel", "Shapes")}
            >
                <RegisteredActionButton
                    instructionalString="Create Circle Shape"
                    registeredAction={RegisteredActionsObjects.createCircle}
                    className="text-text flex gap-6"
                >
                    <CircleIcon size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    instructionalString="Create Square Shape"
                    registeredAction={RegisteredActionsObjects.lockY}
                    className="text-text flex gap-6"
                >
                    <SquareIcon size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    instructionalString="Create Triangle Shape"
                    registeredAction={
                        RegisteredActionsObjects.snapToNearestWhole
                    }
                    className="text-text flex gap-6"
                >
                    <PentagonIcon size={24} />
                </RegisteredActionButton>
                <RegisteredActionButton
                    instructionalString="Create Triangle Shape"
                    registeredAction={
                        RegisteredActionsObjects.snapToNearestWhole
                    }
                    className="text-text flex gap-6"
                >
                    <LineSegmentIcon size={24} />
                </RegisteredActionButton>
            </ToolbarSection>
        </div>
    );
}
