import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import MarcherList from "./MarcherList";
import MarcherForm, { MarcherFormProps } from "./MarcherForm";
import { XIcon, CaretLeftIcon } from "@phosphor-icons/react";
import { Button } from "@openmarch/ui";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import { T, useTranslate } from "@tolgee/react";
import { AppearanceModalContents } from "./appearance/AppearanceModal";
import {
    FRONT_ENSEMBLE_PANEL_ID,
    FrontEnsembleAddContents,
    FrontEnsembleContents,
    FrontEnsembleSummary,
} from "@/components/frontEnsemble/FrontEnsembleModal";

export default function MarchersModal() {
    const { t } = useTranslate();
    return (
        <SidebarModalLauncher
            name={t("sidebar.marchers")}
            contents={<MarcherListContents />}
            newContentId="marchers"
            buttonLabel={<UsersThreeIcon size={24} />}
        />
    );
}

export function MarcherListContents() {
    const { t } = useTranslate();
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">
                    <T keyName="marchers.title" />
                </h4>
                <div className="flex items-center gap-8">
                    <Button
                        onClick={() => {
                            setContent(
                                <AppearanceModalContents />,
                                "marcher-appearance",
                            );
                        }}
                        size="compact"
                        variant="secondary"
                    >
                        <T keyName="marchers.marcherAppearance" />
                    </Button>
                    <Button
                        onClick={() => {
                            setContent(<MarcherFormContents />, "marchers");
                        }}
                        size="compact"
                    >
                        <T keyName="marchers.addMarcher" />
                    </Button>
                    <button
                        aria-label={t("sidebar.close")}
                        onClick={toggleOpen}
                        className="hover:text-red duration-150 ease-out"
                    >
                        <XIcon size={24} />
                    </button>
                </div>
            </header>

            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <FrontEnsembleSummary />
                <MarcherList />
            </div>
        </div>
    );
}

// Marcher add form
export function MarcherFormContents(props: MarcherFormProps) {
    const { t } = useTranslate();
    const { setContent, toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex justify-between gap-24">
                <div className="flex items-center gap-8">
                    <button
                        aria-label={t("marchers.backToList")}
                        onClick={() => {
                            setContent(<MarcherListContents />, "marchers");
                        }}
                        className="hover:text-accent duration-150 ease-out"
                    >
                        <CaretLeftIcon size={24} />
                    </button>
                    <h4 className="text-h4 leading-none">
                        <T
                            keyName={
                                props.marcherIdToEdit
                                    ? "marchers.editMarcher"
                                    : "marchers.addMarchers"
                            }
                        />
                    </h4>
                </div>
                <button
                    aria-label={t("sidebar.close")}
                    onClick={toggleOpen}
                    className="hover:text-red duration-150 ease-out"
                >
                    <XIcon size={24} />
                </button>
            </header>

            <div className="flex w-[28rem] grow flex-col gap-16 overflow-y-auto">
                <MarcherForm {...props} />
            </div>
        </div>
    );
}

/**
 * Opens the sidebar on the front ensemble and podiums view, its back button returning to the
 * Marchers panel: the `openFrontEnsemble` action, which the panel's Front ensemble row runs.
 */
export function openFrontEnsemble() {
    const { setContent, setOpen } = useSidebarModalStore.getState();
    setContent(
        <FrontEnsembleContents
            onBack={() => setContent(<MarcherListContents />, "marchers")}
        />,
        FRONT_ENSEMBLE_PANEL_ID,
    );
    setOpen(true);
}

/**
 * Opens the sidebar on the front ensemble's Add view (the pictures of every model): the
 * `addFrontEnsembleEquipment` action, which the front ensemble view's Add button runs. Back goes
 * to the front ensemble list, then to the Marchers panel.
 */
export function openFrontEnsembleAdd() {
    const { setContent, setOpen } = useSidebarModalStore.getState();
    setContent(
        <FrontEnsembleAddContents
            onBack={() => setContent(<MarcherListContents />, "marchers")}
        />,
        FRONT_ENSEMBLE_PANEL_ID,
    );
    setOpen(true);
}
