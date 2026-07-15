import { OPENMARCH_APP_BASE_URL } from "@/global/Constants";
import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { T } from "@tolgee/react";

function openExternalUrl(url: string) {
    if (window.electron?.openExternal) {
        void window.electron.openExternal(url);
    } else {
        window.open(url, "_blank");
    }
}

const ViewEnsembleDetailsLink = ({ ensembleId }: { ensembleId: number }) => (
    <button
        type="button"
        onClick={(e) => {
            e.stopPropagation();
            openExternalUrl(`${OPENMARCH_APP_BASE_URL}ensembles/${ensembleId}`);
        }}
        className="text-text-subtitle hover:text-accent flex items-center gap-4 text-xs transition-colors duration-150 ease-out"
    >
        <T keyName="ensembles.viewDetails" /> <ArrowSquareOutIcon />
    </button>
);

export default ViewEnsembleDetailsLink;
