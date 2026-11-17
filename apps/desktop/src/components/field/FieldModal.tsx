import { useEffect } from "react";
import { useTranslate } from "@tolgee/react";
import clsx from "clsx";
import ActionButton from "@/shortcuts/ActionButton";
import {
    fieldEditMode,
    useFieldEditModeStore,
    useIsFieldEditMode,
} from "@/field/editMode/fieldEditModeStore";
import {
    FIELD_EDIT_PANEL_ID,
    FieldEditPanel,
} from "@/field/editMode/FieldEditPanel";
import { useSidebarModalStore } from "@/stores/SidebarModalStore";

/**
 * The sidebar's Field button: opens the Field panel (#824) on Setup, with the field shown whole
 * beside it. Pressed again, it's Done.
 */
export default function FieldModal() {
    const { t } = useTranslate();
    const editing = useIsFieldEditMode();
    useFieldEditPanel();
    return (
        <ActionButton
            action="fieldEditMode"
            caption={t("sidebar.field")}
            aria-pressed={editing}
            id="sidebar-launcher-field"
            data-testid="sidebar-field"
            className={clsx(
                "touch:flex touch:min-h-44 touch:w-full touch:flex-col touch:items-center touch:justify-center touch:gap-2",
                editing && "text-accent",
            )}
        >
            <FieldIcon />
        </ActionButton>
    );
}

/**
 * Keeps the Field panel's sidebar slot and its state together: opening it (this button, the
 * palette, the field's menu) shows the panel; Done or X closes it; and the panel closing or
 * giving its place to another panel (Marchers, Show settings) ends it, keeping the changes, as
 * Done does.
 */
export function useFieldEditPanel() {
    useEffect(() => {
        const sidebar = useSidebarModalStore;
        // In one update: the content alone, with the panel still shut, would read as closing it
        const showPanel = () =>
            sidebar.setState({
                content: <FieldEditPanel />,
                contentId: FIELD_EDIT_PANEL_ID,
                isOpen: true,
            });
        if (fieldEditMode.isActive()) showPanel();
        const offMode = useFieldEditModeStore.subscribe((state, before) => {
            if (state.active === before.active) return;
            if (state.active) return showPanel();
            const { isOpen, contentId } = sidebar.getState();
            if (isOpen && contentId === FIELD_EDIT_PANEL_ID)
                sidebar.getState().setOpen(false);
        });
        const offSidebar = sidebar.subscribe(({ isOpen, contentId }) => {
            if (!fieldEditMode.isActive()) return;
            if (!isOpen || contentId !== FIELD_EDIT_PANEL_ID)
                fieldEditMode.exit();
        });
        return () => {
            offMode();
            offSidebar();
        };
    }, []);
}

// from tabler icons, phosphor doesn't have a good field icon
function FieldIcon() {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M12 5V19M9 12C9 12.7956 9.31607 13.5587 9.87868 14.1213C10.4413 14.6839 11.2044 15 12 15C12.7956 15 13.5587 14.6839 14.1213 14.1213C14.6839 13.5587 15 12.7956 15 12C15 11.2044 14.6839 10.4413 14.1213 9.87868C13.5587 9.31607 12.7956 9 12 9C11.2044 9 10.4413 9.31607 9.87868 9.87868C9.31607 10.4413 9 11.2044 9 12ZM3 9H6V15H3V9ZM18 9H21V15H18V9ZM3 7C3 6.46957 3.21071 5.96086 3.58579 5.58579C3.96086 5.21071 4.46957 5 5 5H19C19.5304 5 20.0391 5.21071 20.4142 5.58579C20.7893 5.96086 21 6.46957 21 7V17C21 17.5304 20.7893 18.0391 20.4142 18.4142C20.0391 18.7893 19.5304 19 19 19H5C4.46957 19 3.96086 18.7893 3.58579 18.4142C3.21071 18.0391 3 17.5304 3 17V7Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}
