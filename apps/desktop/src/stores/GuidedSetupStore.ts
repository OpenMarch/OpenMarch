import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WizardState, WizardStepId } from "@/components/wizard/types";

interface GuidedSetupStoreState {
    wizardState: WizardState | null;
    isWizardActive: boolean;
}

interface GuidedSetupStoreActions {
    setWizardState: (state: WizardState | null) => void;
    updateWizardStep: (step: WizardStepId) => void;
    updateProject: (data: WizardState["project"]) => void;
    updateEnsemble: (data: WizardState["ensemble"]) => void;
    updateField: (data: WizardState["field"]) => void;
    updatePerformers: (data: WizardState["performers"]) => void;
    updateMusic: (data: WizardState["music"]) => void;
    setWizardActive: (active: boolean) => void;
    resetWizard: () => void;
}

interface GuidedSetupStoreInterface
    extends GuidedSetupStoreState,
        GuidedSetupStoreActions {}

const STORAGE_KEY = "openmarch:guidedSetupWizard";

export const useGuidedSetupStore = create<GuidedSetupStoreInterface>()(
    persist(
        (set) => ({
            wizardState: null,
            isWizardActive: false,

            setWizardState: (state) => {
                set({ wizardState: state });
            },

            updateWizardStep: (step) => {
                set((state) => {
                    if (!state.wizardState) {
                        console.warn(
                            "[GuidedSetupStore] updateWizardStep called before wizardState was initialized.",
                        );
                        return state;
                    }
                    return {
                        wizardState: {
                            ...state.wizardState,
                            currentStep: step,
                        },
                    };
                });
            },

            updateProject: (data) => {
                set((state) => {
                    if (!state.wizardState) {
                        console.warn(
                            "[GuidedSetupStore] updateProject called before wizardState was initialized.",
                        );
                        return state;
                    }
                    return {
                        wizardState: { ...state.wizardState, project: data },
                    };
                });
            },

            updateEnsemble: (data) => {
                set((state) => {
                    if (!state.wizardState) {
                        console.warn(
                            "[GuidedSetupStore] updateEnsemble called before wizardState was initialized.",
                        );
                        return state;
                    }
                    return {
                        wizardState: { ...state.wizardState, ensemble: data },
                    };
                });
            },

            updateField: (data) => {
                set((state) => {
                    if (!state.wizardState) {
                        console.warn(
                            "[GuidedSetupStore] updateField called before wizardState was initialized.",
                        );
                        return state;
                    }
                    return {
                        wizardState: { ...state.wizardState, field: data },
                    };
                });
            },

            updatePerformers: (data) => {
                set((state) => {
                    if (!state.wizardState) {
                        console.warn(
                            "[GuidedSetupStore] updatePerformers called before wizardState was initialized.",
                        );
                        return state;
                    }
                    return {
                        wizardState: {
                            ...state.wizardState,
                            performers: data,
                        },
                    };
                });
            },

            updateMusic: (data) => {
                set((state) => {
                    if (!state.wizardState) {
                        console.warn(
                            "[GuidedSetupStore] updateMusic called before wizardState was initialized.",
                        );
                        return state;
                    }
                    return {
                        wizardState: { ...state.wizardState, music: data },
                    };
                });
            },

            setWizardActive: (active) => {
                set({ isWizardActive: active });
            },

            resetWizard: () => {
                set({
                    wizardState: null,
                    isWizardActive: false,
                });
            },
        }),
        {
            name: STORAGE_KEY,
            partialize: (state) => ({
                wizardState: state.wizardState,
                isWizardActive: state.isWizardActive,
            }),
        },
    ),
);
