import { useMemo, useEffect } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useTolgee } from "@tolgee/react";
import { toast } from "react-toastify";

// Action system
import { createActionRegistry } from "../actions/registry";
import { createActionBus } from "../actions/bus";
import { registerAllActions } from "../boot/registerActions";
import { bindKeyboard } from "../boot/bindKeyboard";
import { telemetryMiddleware } from "../actions/middleware/telemetry";
import { transactionMiddleware } from "../actions/middleware/transaction";
import { ActionContext } from "../actions/types";

// Contexts and hooks
import { useSelectedPage } from "../context/SelectedPageContext";
import { useIsPlaying } from "../context/IsPlayingContext";
import { useUiSettingsStore } from "../stores/UiSettingsStore";
import { useSelectedMarchers } from "../context/SelectedMarchersContext";
import { useAlignmentEventStore } from "../stores/AlignmentEventStore";
import { useMetronomeStore } from "../stores/MetronomeStore";
import { useTimingObjects } from "../hooks/useTimingObjects";

// Queries and mutations
import {
  marcherPagesByPageQueryOptions,
  updateMarcherPagesMutationOptions,
  swapMarchersMutationOptions,
} from "../hooks/queries/useMarcherPages";
import { useCreateMarcherShape } from "../global/classes/canvasObjects/MarcherShape";
import { fieldPropertiesQueryOptions } from "../hooks/queries/useFieldProperties";
import { canUndoQueryOptions, canRedoQueryOptions, usePerformHistoryAction } from "../hooks/queries/useHistory";

// Utilities
import { getNextPage, getPreviousPage } from "../global/classes/Page";
import { useCallback } from "react";

/**
 * Hook to initialize and provide the action system.
 * This keeps App.tsx clean by encapsulating all action system setup.
 */
export function useActionSystem() {
  const { t } = useTolgee();
  const queryClient = useQueryClient();

  // Page navigation
  const { selectedPage, setSelectedPage } = useSelectedPage()!;
  const { pages } = useTimingObjects()!;

  // Playback
  const { isPlaying, setIsPlaying } = useIsPlaying()!;
  const { toggleMetronome } = useMetronomeStore()!;

  // Selection
  const { selectedMarchers, setSelectedMarchers } = useSelectedMarchers()!;
  const { uiSettings, setUiSettings } = useUiSettingsStore()!;

  // Alignment events
  const {
    resetAlignmentEvent,
    setAlignmentEvent,
    setAlignmentEventMarchers,
    alignmentEventNewMarcherPages,
    alignmentEventMarchers,
  } = useAlignmentEventStore()!;

  // Queries
  const { data: marcherPages } = useQuery(
    marcherPagesByPageQueryOptions(selectedPage?.id)
  );
  const { data: previousMarcherPages } = useQuery(
    marcherPagesByPageQueryOptions(selectedPage?.previousPageId!)
  );
  const { data: nextMarcherPages } = useQuery(
    marcherPagesByPageQueryOptions(selectedPage?.nextPageId!)
  );
  const { data: fieldProperties } = useQuery(fieldPropertiesQueryOptions());
  const { data: canUndo } = useQuery(canUndoQueryOptions);
  const { data: canRedo } = useQuery(canRedoQueryOptions);

  // Mutations
  const { mutate: updateMarcherPages } = useMutation(
    updateMarcherPagesMutationOptions(queryClient)
  );
  const { mutate: swapMarchers } = useMutation(
    swapMarchersMutationOptions(queryClient)
  );
  const { mutate: createMarcherShape } = useCreateMarcherShape();
  const { mutate: performHistoryAction } = usePerformHistoryAction();

  // Helper to get selected marcher pages
  const getSelectedMarcherPages = useCallback(() => {
    if (!selectedPage || !marcherPages) return [];
    return selectedMarchers.map((marcher) => marcherPages[marcher.id]).filter(Boolean);
  }, [marcherPages, selectedMarchers, selectedPage]);

  // Build action context
  const actionContext = useMemo<ActionContext>(
    () => ({
      db: null, // Not needed for most actions
      queryClient,
      fabric: null, // Add when needed
      selection: {
        constraints: {
          lockX: uiSettings.lockX,
          lockY: uiSettings.lockY,
        },
        setConstraints: (c) => {
          setUiSettings({
            ...uiSettings,
            lockX: c.lockX ?? uiSettings.lockX,
            lockY: c.lockY ?? uiSettings.lockY,
          });
        },
        selectedMarchers,
        setSelectedMarchers,
        getSelectedMarcherPages,
      },
      page: {
        selected: selectedPage,
        setSelected: setSelectedPage,
        all: pages,
        getNext: (current) => getNextPage(current, pages),
        getPrevious: (current) => getPreviousPage(current, pages),
      },
      playback: {
        isPlaying,
        setIsPlaying,
        toggleMetronome,
      },
      ui: {
        settings: uiSettings,
        setSettings: setUiSettings,
        focusCanvas: () => {
          setUiSettings({ ...uiSettings, focussedComponent: "canvas" });
        },
        focusTimeline: () => {
          setUiSettings({ ...uiSettings, focussedComponent: "timeline" });
        },
      },
      queries: {
        marcherPages: marcherPages || {},
        previousMarcherPages: previousMarcherPages || {},
        nextMarcherPages: nextMarcherPages || {},
        fieldProperties: fieldProperties || {},
        canUndo: canUndo ?? false,
        canRedo: canRedo ?? false,
      },
      mutations: {
        updateMarcherPages,
        swapMarchers,
        createMarcherShape,
        performHistoryAction,
      },
      alignment: {
        reset: resetAlignmentEvent,
        setEvent: setAlignmentEvent,
        setMarchers: setAlignmentEventMarchers,
        newMarcherPages: alignmentEventNewMarcherPages,
        marchers: alignmentEventMarchers,
      },
      electron: typeof window !== "undefined" ? (window as any).electron : undefined,
      t,
      toast,
    }),
    [
      queryClient,
      selectedMarchers,
      setSelectedMarchers,
      getSelectedMarcherPages,
      selectedPage,
      setSelectedPage,
      pages,
      isPlaying,
      setIsPlaying,
      toggleMetronome,
      uiSettings,
      setUiSettings,
      marcherPages,
      previousMarcherPages,
      nextMarcherPages,
      fieldProperties,
      canUndo,
      canRedo,
      updateMarcherPages,
      swapMarchers,
      createMarcherShape,
      performHistoryAction,
      resetAlignmentEvent,
      setAlignmentEvent,
      setAlignmentEventMarchers,
      alignmentEventNewMarcherPages,
      alignmentEventMarchers,
      t,
    ]
  );

  // Expose context for ActionButton's isToggled queries
  useEffect(() => {
    (window as any).__actionCtx = actionContext;
  }, [actionContext]);

  // Create registry and bus
  const { registry, bus } = useMemo(() => {
    const registry = createActionRegistry();
    registerAllActions(registry);

    const bus = createActionBus(registry, actionContext);
    bus.addMiddleware(telemetryMiddleware(console.log));
    bus.addMiddleware(transactionMiddleware(actionContext, new Set([])));

    return { registry, bus };
  }, [actionContext]);

  // Bind keyboard
  useEffect(() => {
    const unbind = bindKeyboard(bus);
    return unbind;
  }, [bus]);

  return { registry, bus };
}
