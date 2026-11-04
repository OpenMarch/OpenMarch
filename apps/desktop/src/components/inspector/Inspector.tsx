import MarcherEditor from "./MarcherEditor";
import PageEditor from "./PageEditor";
import { ShapeToolSection } from "@/shapes/tool/ShapeToolSection";
import { TransformSection } from "@/shapes/transform/TransformSection";
import { PageNotesSection } from "./PageNotesSection";
import { TimelineMoveCardSlot } from "./TimelineMoveCard";
import { T } from "@tolgee/react";
import { useIsBasicMode } from "@/stores/EditorModeStore";
import { InspectorPageProvider } from "./InspectorPageContext";
import { useCompactInspector } from "./useCompactInspector";

function Inspector() {
    // UI-19: Basic has no move cards (range, delete move): they make moves Basic can't edit
    const basic = useIsBasicMode();
    // On a tablet or a short screen the fixed notes footer leaves too little
    // room above it, so the notes scroll with everything else
    const compact = useCompactInspector();
    return (
        <InspectorPageProvider>
            <div className="rounded-6 border-stroke bg-fg-1 flex h-full w-xs min-w-0 flex-col border p-12">
                <p className="text-body text-text/60">
                    <T keyName="inspector.title" />
                </p>

                {/* Scrollable inspector content */}
                {/* relative so Radix's visually-hidden native selects are contained here instead of escaping to the document */}
                <div className="relative mt-8 flex min-h-0 flex-1 flex-col gap-48 overflow-y-auto">
                    {/* Shapes come first: picking one is the usual next step after selecting */}
                    <ShapeToolSection />
                    {/* Pivot, turn, flip and scale for any selection (#349) */}
                    <TransformSection />
                    {/* UI-14 review: a selected move's card comes first */}
                    {!basic && <TimelineMoveCardSlot />}
                    <PageEditor />
                    <MarcherEditor />
                    {/* ADR 0002 D-22: the show's one quiet list, in both modes */}
                    {compact && <PageNotesSection />}
                </div>

                {/* Fixed notes footer at the bottom of the inspector */}
                {!compact && (
                    <div className="mt-12">
                        <PageNotesSection />
                    </div>
                )}
            </div>
        </InspectorPageProvider>
    );
}

export default Inspector;
