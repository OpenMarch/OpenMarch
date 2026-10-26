import MarcherEditor from "./MarcherEditor";
import PageEditor from "./PageEditor";
import AlignmentEditor from "./AlignmentEditor";
import ShapeEditor from "./ShapeEditor";
import ShapeSelector from "./ShapeSelector";
import { PageNotesSection } from "./PageNotesSection";
import { T } from "@tolgee/react";
import { useCompactInspector } from "./useCompactInspector";

function Inspector() {
    // On a tablet or a short screen the fixed notes footer leaves too little
    // room above it, so the notes scroll with everything else
    const compact = useCompactInspector();
    return (
        <div className="rounded-6 border-stroke bg-fg-1 flex h-full w-xs min-w-0 flex-col border p-12">
            <p className="text-body text-text/60">
                <T keyName="inspector.title" />
            </p>

            {/* Scrollable inspector content */}
            {/* relative so Radix's visually-hidden native selects are contained here instead of escaping to the document */}
            <div className="relative mt-8 flex min-h-0 flex-1 flex-col gap-48 overflow-y-auto">
                <PageEditor />
                <MarcherEditor />
                <ShapeEditor />
                <AlignmentEditor />
                <ShapeSelector />
                {compact && <PageNotesSection />}
            </div>

            {/* Fixed notes footer at the bottom of the inspector */}
            {!compact && (
                <div className="mt-12">
                    <PageNotesSection />
                </div>
            )}
        </div>
    );
}

export default Inspector;
