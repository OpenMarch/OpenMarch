import Database from "better-sqlite3";
import * as DbActions from "../DatabaseActions";
import Constants from "../../../src/global/Constants";

/**
 * Represents an appearance configuration for a section
 */
export interface SectionAppearance {
    id: number;
    section: string;
    fill_color: string;
    outline_color: string;
    shape_type: string;
    created_at: string;
    updated_at: string;
}

/**
 * Arguments for creating a new section appearance
 */
export interface NewSectionAppearanceArgs {
    section: string;
    fill_color?: string;
    outline_color?: string;
    shape_type?: string;
}

/**
 * Arguments for modifying an existing section appearance
 */
export interface ModifiedSectionAppearanceArgs {
    id: number;
    fill_color?: string;
    outline_color?: string;
    shape_type?: string;
}

/**
 * Get all section appearances or a specific one if section is provided
 * @param db The database connection
 * @param section Optional section name to filter by
 * @returns Database response with section appearances
 */
export function getSectionAppearances({
    db,
    section,
}: {
    db: Database.Database;
    section?: string;
}): DbActions.DatabaseResponse<SectionAppearance[]> {
    if (section) {
        return DbActions.getItemsByColValue<SectionAppearance>({
            db,
            tableName: Constants.SectionAppearancesTableName,
            col: "section",
            value: section,
        });
    } else {
        return DbActions.getAllItems<SectionAppearance>({
            db,
            tableName: Constants.SectionAppearancesTableName,
        });
    }
}

/**
 * Create new section appearances
 * @param db The database connection
 * @param newSectionAppearances New section appearances to create
 * @returns Database response with created section appearances
 */
export function createSectionAppearances({
    db,
    newSectionAppearances,
}: {
    db: Database.Database;
    newSectionAppearances: NewSectionAppearanceArgs[];
}): DbActions.DatabaseResponse<SectionAppearance[]> {
    return DbActions.createItems<SectionAppearance, NewSectionAppearanceArgs>({
        db,
        tableName: Constants.SectionAppearancesTableName,
        items: newSectionAppearances,
        useNextUndoGroup: true,
        functionName: "createSectionAppearances",
    });
}

/**
 * Update existing section appearances
 * @param db The database connection
 * @param modifiedSectionAppearances Section appearances to update
 * @returns Database response with updated section appearances
 */
export function updateSectionAppearances({
    db,
    modifiedSectionAppearances,
}: {
    db: Database.Database;
    modifiedSectionAppearances: ModifiedSectionAppearanceArgs[];
}): DbActions.DatabaseResponse<SectionAppearance[]> {
    return DbActions.updateItems<
        SectionAppearance,
        ModifiedSectionAppearanceArgs
    >({
        db,
        tableName: Constants.SectionAppearancesTableName,
        items: modifiedSectionAppearances,
        useNextUndoGroup: true,
        functionName: "updateSectionAppearances",
    });
}

/**
 * Delete section appearances
 * @param db The database connection
 * @param sectionAppearanceIds IDs of section appearances to delete
 * @returns Database response with deleted section appearances
 */
export function deleteSectionAppearances({
    db,
    sectionAppearanceIds,
}: {
    db: Database.Database;
    sectionAppearanceIds: Set<number>;
}): DbActions.DatabaseResponse<SectionAppearance[]> {
    return DbActions.deleteItems<SectionAppearance>({
        db,
        tableName: Constants.SectionAppearancesTableName,
        ids: sectionAppearanceIds,
        useNextUndoGroup: true,
        functionName: "deleteSectionAppearances",
    });
}
