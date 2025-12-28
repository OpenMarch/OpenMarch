import posthog from "posthog-js";
import type Page from "@/global/classes/Page";
import type Marcher from "@/global/classes/Marcher";
import type AudioFile from "@/global/classes/AudioFile";
import type { ShapePage } from "@/db-functions/shapePages";
import type { DatabaseTag } from "@/db-functions/tag";
import type { DatabasePage } from "@/db-functions";

// ============================================================================
// User Identification & Person Properties
// ============================================================================

/**
 * Gets or creates a unique user ID stored in electron-store.
 * This ID persists across app sessions and is used for user identification.
 */
export async function getOrCreateUserId(): Promise<string> {
    try {
        const existingId = await window.electron.invoke(
            "settings:get",
            "posthogUserId",
        );
        if (existingId && typeof existingId === "string") {
            return existingId;
        }

        // Generate a new UUID
        const newId = crypto.randomUUID();
        await window.electron.send("settings:set", {
            posthogUserId: newId,
        });
        return newId;
    } catch (error) {
        console.warn("[Analytics] Failed to get/create user ID:", error);
        // Fallback to a temporary ID if storage fails
        return crypto.randomUUID();
    }
}

/**
 * Identifies a user in PostHog with a stable distinct ID.
 * Should be called after PostHog initialization and when user opts in.
 */
export async function identifyUser(): Promise<void> {
    if (!canTrack()) {
        return;
    }

    try {
        const userId = await getOrCreateUserId();
        posthog.identify(userId);
    } catch (error) {
        console.warn("[Analytics] Failed to identify user:", error);
    }
}

/**
 * Sets person properties that can be updated (e.g., app_version, platform).
 * These properties are associated with the person, not individual events.
 */
export function setPersonProperties(properties: Record<string, any>): void {
    if (!canTrack()) {
        return;
    }

    try {
        posthog.capture("$identify", {
            $set: properties,
        });
    } catch (error) {
        console.warn("[Analytics] Failed to set person properties:", error);
    }
}

/**
 * Sets person properties that should only be set once (e.g., first_install_date).
 * Once set, these properties cannot be changed by calling this function again.
 */
export function setPersonPropertiesOnce(properties: Record<string, any>): void {
    if (!canTrack()) {
        return;
    }

    try {
        posthog.capture("$identify", {
            $set_once: properties,
        });
    } catch (error) {
        console.warn(
            "[Analytics] Failed to set person properties once:",
            error,
        );
    }
}

/**
 * Initializes user identification and sets initial person properties.
 * Should be called after PostHog initialization and when user opts in.
 */
export async function initializeUserTracking(): Promise<void> {
    if (!canTrack()) {
        return;
    }

    try {
        // Identify the user
        await identifyUser();

        // Get standard properties
        const standardProps = getStandardProps();

        // Set properties that can change (app_version, platform)
        setPersonProperties({
            app_version: standardProps.app_version,
            platform: standardProps.platform,
        });

        // Set first install date if not already set
        const firstInstallDate = await window.electron.invoke(
            "settings:get",
            "firstInstallDate",
        );
        if (!firstInstallDate) {
            const installDate = new Date().toISOString();
            await window.electron.send("settings:set", {
                firstInstallDate: installDate,
            });
            setPersonPropertiesOnce({
                first_install_date: installDate,
            });
        }
    } catch (error) {
        console.warn("[Analytics] Failed to initialize user tracking:", error);
    }
}

// ============================================================================
// Event Interfaces
// ============================================================================

/**
 * Standard properties sent with every event.
 * Note: PostHog automatically handles timestamp, distinct_id, etc.
 */
interface StandardEventProps {
    app_version: string;
    environment: string;
    platform: string;
}

/**
 * Properties for shape-related events
 */
export interface ShapeEvent {
    shape_id: number;
    page_id: number;
    has_notes: boolean;
    is_locked?: boolean;
}

/**
 * Properties for page-related events
 */
export interface PageEvent {
    page_id: number;
    page_number?: number; // calculated from order + 1 usually, or name
    counts?: number;
    is_subset: boolean;
    duration_seconds?: number;
    has_notes: boolean;
}

/**
 * Properties for music/audio-related events
 */
export interface MusicEvent {
    file_id?: number;
    has_nickname?: boolean;
    duration_seconds?: number; // Approximate if not available immediately
    file_format?: string;
    measure_count?: number;
    tempo_group_count?: number;
}

/**
 * Properties for marcher-related events
 */
export interface MarcherEvent {
    marcher_id: number;
    section: string;
    drill_prefix: string;
    drill_number: string; // Combined prefix + order
}

/**
 * Properties for tag-related events
 */
export interface TagEvent {
    tag_id: number;
    has_description: boolean;
}

/**
 * Properties for selection-related events
 */
export interface SelectionEvent {
    item_count: number;
    item_type: "marcher" | "shape" | "page" | "tag";
}

/**
 * Properties for wizard-related events
 */
export interface WizardEvent {
    step_name?: string;
    step_index?: number;
    action: "start" | "next" | "back" | "skip" | "complete" | "abandon";
    context?: Record<string, any>;
}

/**
 * Properties for editor interactions
 */
export interface EditorActionEvent {
    action_name: string;
    context?: Record<string, any>; // selection_count, tool_mode, etc.
}

/**
 * Properties for batch operations (like copy from previous page)
 */
export interface BatchOperationEvent {
    operation_type: string; // "copy_previous", "copy_next", "bulk_move"
    item_count: number;
    target_page_id?: number;
}

/**
 * Properties for playback sessions
 */
export interface PlaybackEvent {
    action: "start" | "stop";
    duration_seconds?: number; // For stop events
    playback_position?: number;
    is_full_show?: boolean;
}

/**
 * Properties for export events
 */
export interface ExportEvent {
    export_type: "coordinate_sheets" | "drill_charts" | "field_properties";
    status: "started" | "completed" | "failed" | "cancelled";
    item_count?: number; // number of sheets/pages
    error?: string;
}

/**
 * Properties for project lifecycle events
 */
export interface ProjectEvent {
    action: "create" | "open";
    method: "wizard" | "file_picker" | "recent";
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Checks if PostHog is initialized and the user has not opted out.
 */
const canTrack = (): boolean => {
    // Check if PostHog is initialized.
    if (!posthog.__loaded) {
        return false;
    }

    // Check opt-out status
    return !posthog.has_opted_out_capturing();
};

const getStandardProps = (): StandardEventProps => {
    return {
        app_version: import.meta.env.PACKAGE_VERSION || "unknown",
        environment: import.meta.env.MODE,
        platform: window.navigator.platform,
    };
};

/**
 * Generic wrapper to track an event safely.
 */
const track = (eventName: string, properties?: Record<string, any>) => {
    if (!canTrack()) {
        return;
    }

    try {
        posthog.capture(eventName, {
            ...getStandardProps(),
            ...properties,
        });
    } catch (error) {
        console.warn(`[Analytics] Failed to track event ${eventName}`, error);
    }
};

// ============================================================================
// Typed Tracking Methods
// ============================================================================

// --- Shape Events ---

export const trackShapeCreated = (shape: ShapePage) => {
    track("shape_created", {
        shape_id: shape.id,
        page_id: shape.page_id,
        has_notes: !!shape.notes,
    } satisfies ShapeEvent);
};

export const trackShapeUpdated = (shape: ShapePage) => {
    track("shape_updated", {
        shape_id: shape.id,
        page_id: shape.page_id,
        has_notes: !!shape.notes,
    } satisfies ShapeEvent);
};

export const trackShapeDeleted = (shapeId: number) => {
    track("shape_deleted", {
        shape_id: shapeId,
    });
};

// --- Page Events ---

export const trackPageCreated = (page: Page) => {
    track("page_created", {
        page_id: page.id,
        page_number: page.order,
        counts: page.counts,
        is_subset: page.isSubset,
        duration_seconds: page.duration,
        has_notes: !!page.notes,
    } satisfies PageEvent);
};

export const trackPageCreatedFromDB = (page: DatabasePage) => {
    track("page_created", {
        page_id: page.id,
        is_subset: page.is_subset,
        has_notes: !!page.notes,
    } satisfies PageEvent);
};

export const trackPageUpdated = (page: Page) => {
    track("page_updated", {
        page_id: page.id,
        page_number: page.order,
        counts: page.counts,
        is_subset: page.isSubset,
        duration_seconds: page.duration,
        has_notes: !!page.notes,
    } satisfies PageEvent);
};

export const trackPageUpdatedFromDB = (page: DatabasePage) => {
    track("page_updated", {
        page_id: page.id,
        is_subset: page.is_subset,
        has_notes: !!page.notes,
    } satisfies PageEvent);
};

export const trackPageDeleted = (pageId: number) => {
    track("page_deleted", {
        page_id: pageId,
    });
};

// --- Music Events ---

export const trackMusicAdded = (audio: AudioFile) => {
    track("music_added", {
        file_id: audio.id,
        has_nickname: !!audio.nickname && audio.nickname !== audio.path,
        // AudioFile might not have duration immediately available in properties unless we parse it
        file_format: audio.path.split(".").pop()?.toLowerCase() || "unknown",
    } satisfies MusicEvent);
};

export const trackMusicXmlImported = (stats: {
    measure_count: number;
    tempo_group_count: number;
}) => {
    track("music_xml_imported", {
        file_format: "xml",
        ...stats,
    } satisfies MusicEvent);
};

export const trackMusicSelected = (audio: AudioFile) => {
    track("music_selected", {
        file_id: audio.id,
        has_nickname: !!audio.nickname,
    } satisfies MusicEvent);
};

// --- Marcher Events ---

export const trackMarcherCreated = (marcher: Marcher) => {
    track("marcher_created", {
        marcher_id: marcher.id,
        section: marcher.section,
        drill_prefix: marcher.drill_prefix,
        drill_number: marcher.drill_number,
    } satisfies MarcherEvent);
};

export const trackMarcherUpdated = (marcher: Marcher) => {
    track("marcher_updated", {
        marcher_id: marcher.id,
        section: marcher.section,
        drill_prefix: marcher.drill_prefix,
        drill_number: marcher.drill_number,
    } satisfies MarcherEvent);
};

// --- Tag Events ---

export const trackTagCreated = (tag: DatabaseTag) => {
    track("tag_created", {
        tag_id: tag.id,
        has_description: !!tag.description,
    } satisfies TagEvent);
};

export const trackTagApplied = (
    tagId: number,
    targetType: "marcher" | "page",
    targetId: number,
) => {
    track("tag_applied", {
        tag_id: tagId,
        target_type: targetType,
        target_id: targetId,
    });
};

// --- Selection Events ---

export const trackSelectionChanged = (
    type: SelectionEvent["item_type"],
    count: number,
) => {
    // Only track if something is actually selected to reduce noise?
    // Or tracking 0 selection (clearing) might be useful.
    track("selection_changed", {
        item_type: type,
        item_count: count,
    } satisfies SelectionEvent);
};

export const trackFileOperation = (operation: string) => {
    track("file_operation", {
        operation,
    });
};

export const trackPlaybackState = (
    isPlaying: boolean,
    currentTime?: number,
) => {
    track(isPlaying ? "playback_started" : "playback_stopped", {
        current_time: currentTime,
    });
};

// --- Wizard Events ---

export const trackWizardStart = () => {
    track("wizard_progress", {
        action: "start",
    } satisfies WizardEvent);
};

export const trackWizardStep = (
    stepName: string,
    stepIndex: number,
    action: "next" | "back" | "skip",
    context?: Record<string, any>,
) => {
    track("wizard_progress", {
        step_name: stepName,
        step_index: stepIndex,
        action,
        context,
    } satisfies WizardEvent);
};

export const trackWizardComplete = () => {
    track("wizard_progress", {
        action: "complete",
    } satisfies WizardEvent);
};

export const trackWizardAbandon = (stepName: string, stepIndex: number) => {
    track("wizard_progress", {
        step_name: stepName,
        step_index: stepIndex,
        action: "abandon",
    } satisfies WizardEvent);
};

// --- Editor Events ---

export const trackEditorAction = (
    actionName: string,
    context?: Record<string, any>,
) => {
    track("editor_action", {
        action_name: actionName,
        context,
    } satisfies EditorActionEvent);
};

export const trackUndoRedo = (type: "undo" | "redo") => {
    track("editor_action", {
        action_name: type,
    } satisfies EditorActionEvent);
};

// --- Batch Operation Events ---

export const trackBatchOperation = (
    operationType: string,
    itemCount: number,
    targetPageId?: number,
) => {
    track("batch_operation", {
        operation_type: operationType,
        item_count: itemCount,
        target_page_id: targetPageId,
    } satisfies BatchOperationEvent);
};

// --- Playback Events ---

export const trackPlaybackStart = (
    playbackPosition: number,
    isFullShow: boolean,
) => {
    track("playback_session", {
        action: "start",
        playback_position: playbackPosition,
        is_full_show: isFullShow,
    } satisfies PlaybackEvent);
};

export const trackPlaybackStop = (
    durationSeconds: number,
    playbackPosition: number,
) => {
    track("playback_session", {
        action: "stop",
        duration_seconds: durationSeconds,
        playback_position: playbackPosition,
    } satisfies PlaybackEvent);
};

// --- Export Events ---

export const trackExportStart = (
    type: ExportEvent["export_type"],
    context?: Record<string, any>,
) => {
    track("export_event", {
        export_type: type,
        status: "started",
        ...context,
    } satisfies ExportEvent);
};

export const trackExportComplete = (
    type: ExportEvent["export_type"],
    itemCount: number,
) => {
    track("export_event", {
        export_type: type,
        status: "completed",
        item_count: itemCount,
    } satisfies ExportEvent);
};

export const trackExportFailed = (
    type: ExportEvent["export_type"],
    error: string,
) => {
    track("export_event", {
        export_type: type,
        status: "failed",
        error,
    } satisfies ExportEvent);
};

// --- Project Lifecycle Events ---

export const trackProjectEvent = (
    action: ProjectEvent["action"],
    method: ProjectEvent["method"],
) => {
    track("project_lifecycle", {
        action,
        method,
    } satisfies ProjectEvent);
};

export const analytics = {
    trackShapeCreated,
    trackShapeUpdated,
    trackShapeDeleted,
    trackPageCreated,
    trackPageCreatedFromDB,
    trackPageUpdated,
    trackPageUpdatedFromDB,
    trackPageDeleted,
    trackMusicAdded,
    trackMusicXmlImported,
    trackMusicSelected,
    trackMarcherCreated,
    trackMarcherUpdated,
    trackTagCreated,
    trackTagApplied,
    trackSelectionChanged,
    trackFileOperation,
    trackPlaybackState,
    trackWizardStart,
    trackWizardStep,
    trackWizardComplete,
    trackWizardAbandon,
    trackEditorAction,
    trackUndoRedo,
    trackBatchOperation,
    trackPlaybackStart,
    trackPlaybackStop,
    trackExportStart,
    trackExportComplete,
    trackExportFailed,
    trackProjectEvent,
};
