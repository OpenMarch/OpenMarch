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
                set((state) => ({
                    wizardState: state.wizardState
                        ? { ...state.wizardState, currentStep: step }
                        : null,
                }));
            },

            updateProject: (data) => {
                set((state) => ({
                    wizardState: state.wizardState
                        ? { ...state.wizardState, project: data }
                        : null,
                }));
            },

            updateEnsemble: (data) => {
                set((state) => ({
                    wizardState: state.wizardState
                        ? { ...state.wizardState, ensemble: data }
                        : null,
                }));
            },

            updateField: (data) => {
                set((state) => ({
                    wizardState: state.wizardState
                        ? { ...state.wizardState, field: data }
                        : null,
                }));
            },

            updatePerformers: (data) => {
                set((state) => ({
                    wizardState: state.wizardState
                        ? { ...state.wizardState, performers: data }
                        : null,
                }));
            },

            updateMusic: (data) => {
                set((state) => ({
                    wizardState: state.wizardState
                        ? { ...state.wizardState, music: data }
                        : null,
                }));
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
