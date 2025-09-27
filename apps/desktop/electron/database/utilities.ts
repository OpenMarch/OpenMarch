// import Database from "better-sqlite3";
// import type MarcherPage from "../../src/global/classes/MarcherPage";
// import * as History from "./database.history";
// import * as DbActions from "./DatabaseActions";
// import * as ShapePageMarcherTable from "./tables/ShapePageMarcherTable";
// import { ModifiedMarcherPageArgs } from "../../src/global/classes/MarcherPage";

// export type SwapMarchersArgs = {
//     db: Database.Database;
//     pageId: number;
//     marcher1Id: number;
//     marcher2Id: number;
// };

// /**
//  * Swaps the positions of two marchers on a given page.
//  *
//  * @param db - The database connection.
//  * @param pageId - The ID of the page where the marchers are located.
//  * @param marcher1Id - The ID of the first marcher to swap.
//  * @param marcher2Id - The ID of the second marcher to swap.
//  * @returns A database response containing the updated MarcherPage[] data.
//  */
// export const swapMarchers = ({
//     db,
//     pageId,
//     marcher1Id,
//     marcher2Id,
// }: SwapMarchersArgs): DbActions.DatabaseResponse<MarcherPage[]> => {
//     let output: DbActions.DatabaseResponse<MarcherPage[]>;
//     let actionWasPerformed = false;
//     console.log("\n================ SWAPPING MARCHERS =================");
//     try {
//         const marcherPage1Response = MarcherPageTable.getMarcherPage({
//             page_id: pageId,
//             marcher_id: marcher1Id,
//             db,
//         });
//         const marcherPage2Response = MarcherPageTable.getMarcherPage({
//             page_id: pageId,
//             marcher_id: marcher2Id,
//             db,
//         });
//         if (!marcherPage1Response.success || marcherPage1Response.data === null)
//             throw new Error(
//                 marcherPage1Response.error?.message ||
//                     `Could not find marcher page for page ${pageId} and marcher ${marcher1Id}`,
//             );
//         if (!marcherPage2Response.success || marcherPage2Response.data === null)
//             throw new Error(
//                 marcherPage2Response.error?.message ||
//                     `Could not find marcher page for page ${pageId} and marcher ${marcher2Id}`,
//             );
//         const marcherPage1 = marcherPage1Response.data;
//         const marcherPage2 = marcherPage2Response.data;

//         const spm1Response = ShapePageMarcherTable.getSpmByMarcherPage({
//             db,
//             marcherPage: { marcher_id: marcher1Id, page_id: pageId },
//         });
//         const spm2Response = ShapePageMarcherTable.getSpmByMarcherPage({
//             db,
//             marcherPage: { marcher_id: marcher2Id, page_id: pageId },
//         });

//         const spm1Exists = spm1Response.success && !!spm1Response.data;
//         const spm2Exists = spm2Response.success && !!spm2Response.data;
//         const updateSpms = spm1Exists || spm2Exists;

//         if (updateSpms) {
//             History.incrementUndoGroup(db);

//             if (spm1Exists && spm2Exists) {
//                 const spm1 = spm1Response.data;
//                 const spm2 = spm2Response.data;
//                 if (spm1.shape_page_id === spm2.shape_page_id) {
//                     const updateSpmsResponse =
//                         ShapePageMarcherTable.swapPositionOrder({
//                             db,
//                             spmId1: spm1.id,
//                             spmId2: spm2.id,
//                         });
//                     if (!updateSpmsResponse.success)
//                         throw new Error(
//                             updateSpmsResponse.error?.message ||
//                                 `Could not update shape page marchers`,
//                         );
//                     actionWasPerformed = true;
//                 } else {
//                     // Swap the shape_page that these SPMs are in
//                     const deleteSpmsResponse =
//                         ShapePageMarcherTable.deleteShapePageMarchers({
//                             db,
//                             ids: new Set([spm1.id, spm2.id]),
//                         });
//                     if (!deleteSpmsResponse.success)
//                         throw new Error(
//                             deleteSpmsResponse.error?.message ||
//                                 `Could not delete shape page marchers`,
//                         );
//                     actionWasPerformed = true;

//                     const newSpms: ShapePageMarcherTable.NewShapePageMarcherArgs[] =
//                         [
//                             {
//                                 marcher_id: spm1.marcher_id,
//                                 shape_page_id: spm2.shape_page_id,
//                                 position_order: spm2.position_order,
//                                 notes: spm2.notes,
//                             },
//                             {
//                                 marcher_id: spm2.marcher_id,
//                                 shape_page_id: spm1.shape_page_id,
//                                 position_order: spm1.position_order,
//                                 notes: spm1.notes,
//                             },
//                         ];

//                     const createSpmsResponse =
//                         ShapePageMarcherTable.createShapePageMarchers({
//                             db,
//                             args: newSpms,
//                         });
//                     if (!createSpmsResponse.success)
//                         throw new Error(
//                             createSpmsResponse.error?.message ||
//                                 `Could not create shape page marchers`,
//                         );
//                 }
//             } else {
//                 const spm1 = spm1Exists ? spm1Response.data : spm2Response.data;
//                 const spm2 = spm1Exists ? spm2Response.data : spm1Response.data;

//                 const spm = spm1 || spm2;
//                 console.log("spm", spm);
//                 console.log("spm1", spm1);
//                 console.log("spm2", spm2);
//                 if (!spm) throw new Error("Could not find spm");
//                 const marcherPageWithoutSpm = spm1Exists
//                     ? marcherPage2
//                     : marcherPage1;
//                 const newSpm: ShapePageMarcherTable.NewShapePageMarcherArgs = {
//                     marcher_id: marcherPageWithoutSpm.marcher_id,
//                     shape_page_id: spm.shape_page_id,
//                     position_order: spm.position_order,
//                     notes: spm.notes,
//                 };
//                 const deleteSpmResponse =
//                     ShapePageMarcherTable.deleteShapePageMarchers({
//                         db,
//                         ids: new Set([spm.id]),
//                     });
//                 if (!deleteSpmResponse.success)
//                     throw new Error(
//                         deleteSpmResponse.error?.message ||
//                             `Could not delete shape page marcher`,
//                     );
//                 actionWasPerformed = true;

//                 const createSpmResponse =
//                     ShapePageMarcherTable.createShapePageMarchers({
//                         db,
//                         args: [newSpm],
//                     });
//                 if (!createSpmResponse.success)
//                     throw new Error(
//                         createSpmResponse.error?.message ||
//                             `Could not create shape page marcher`,
//                     );
//             }
//         }

//         const modifiedMarcherPages: ModifiedMarcherPageArgs[] = [
//             {
//                 page_id: pageId,
//                 marcher_id: marcherPage1.marcher_id,
//                 x: marcherPage2.x,
//                 y: marcherPage2.y,
//             },
//             {
//                 page_id: pageId,
//                 marcher_id: marcherPage2.marcher_id,
//                 x: marcherPage1.x,
//                 y: marcherPage1.y,
//             },
//         ];

//         const updateMarcherPagesResponse = MarcherPageTable.updateMarcherPages({
//             db,
//             marcherPageUpdates: modifiedMarcherPages,
//             isChildAction: updateSpms,
//         });
//         if (!updateMarcherPagesResponse.success)
//             throw new Error(
//                 updateMarcherPagesResponse.error?.message ||
//                     `Could not update marcher pages`,
//             );
//         output = updateMarcherPagesResponse;
//     } catch (error: any) {
//         console.error(error);
//         if (actionWasPerformed) {
//             console.log("Rolling back swap marchers");
//             History.performUndo(db);
//             History.clearMostRecentRedo(db);
//         }
//         output = {
//             success: false,
//             data: [],
//             error: {
//                 message: error?.message || "Could not swap marchers",
//                 stack: error?.stack || "Could not get stack",
//             },
//         };
//     } finally {
//         console.log("=============== END SWAP MARCHERS ===============\n");
//     }
//     return output;
// };
