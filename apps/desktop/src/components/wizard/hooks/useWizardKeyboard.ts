import { useCallback, type KeyboardEvent } from "react";

interface UseWizardKeyboardProps {
    isCompleting: boolean;
    isLastStep: boolean;
    canGoNext: boolean;
    canGoBack: boolean;
    onNext?: () => void;
    onBack?: () => void;
    onComplete?: () => void;
    onExit?: () => void;
    isNavigating: () => boolean;
}

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "BUTTON", "SELECT"]);
const INTERACTIVE_ROLES = new Set([
    "button",
    "link",
    "menuitem",
    "option",
    "combobox",
    "listbox",
    "treeitem",
]);

function isInputElement(element: HTMLElement): boolean {
    if (
        INPUT_TAGS.has(element.tagName) ||
        element.isContentEditable ||
        element.closest("input, textarea, [contenteditable]") !== null
    ) {
        return true;
    }

    // Check for anchor elements with href
    if (element.tagName === "A" && element.hasAttribute("href")) {
        return true;
    }

    // Check for interactive ARIA roles
    const role = element.getAttribute("role");
    if (role && INTERACTIVE_ROLES.has(role.toLowerCase())) {
        return true;
    }

    return false;
}

export function useWizardKeyboard({
    isCompleting,
    isLastStep,
    canGoNext,
    canGoBack,
    onNext,
    onBack,
    onComplete,
    onExit,
    isNavigating,
}: UseWizardKeyboardProps) {
    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLElement>) => {
            if (isCompleting || isNavigating()) return;

            const target = e.target as HTMLElement;
            if (isInputElement(target)) return;

            // Enter key - proceed to next step or complete
            if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                if (isLastStep && canGoNext && onComplete) {
                    onComplete();
                } else if (!isLastStep && canGoNext && onNext) {
                    onNext();
                }
                return;
            }

            // Escape key - go back or exit
            if (e.key === "Escape") {
                e.preventDefault();
                if (canGoBack && onBack) {
                    onBack();
                } else if (onExit) {
                    onExit();
                }
            }
        },
        [
            isCompleting,
            isLastStep,
            canGoNext,
            canGoBack,
            onNext,
            onBack,
            onComplete,
            onExit,
            isNavigating,
        ],
    );

    return { handleKeyDown };
}
