import MarcherEditor from "./MarcherEditor";
import PageEditor from "./PageEditor";
import AlignmentEditor from "./AlignmentEditor";
import ShapeEditor from "./ShapeEditor";
import ShapeSelector from "./ShapeSelector";
import { PageNotesSection } from "./PageNotesSection";
import { T } from "@tolgee/react";

function Inspector() {
    return (
        <div className="rounded-6 border-stroke bg-fg-1 flex h-full w-xs min-w-0 flex-col border p-12">
            <p className="text-body text-text/60">
                <T keyName="inspector.title" />
            </p>

            {/* Scrollable inspector content */}
            <div className="mt-8 flex min-h-0 flex-1 flex-col gap-48 overflow-y-auto">
                <PageEditor />
                <MarcherEditor />
                <ShapeEditor />
                <AlignmentEditor />
                <ShapeSelector />
            </div>

            {/* Fixed notes footer at the bottom of the inspector */}
            <div className="mt-12">
                <PageNotesSection />
            </div>
        </div>
    );
}

export default Inspector;
