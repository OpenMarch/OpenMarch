
import { Page } from "@/global/Interfaces";

/**
 * Retrieves the next page based on the current page and the list of all pages.
 * If the current page is the last page, null is returned.
 *
 * @param Page options.currentPage - The current page.
 * @param Page[] options.allPages - The list of all pages.
 *
 * @returns {Page | null} - The next page or null if the current page is the last page.
 *
 * @throws {Error} - If the current page is not found in the list of all pages.
 */
export function getNextPage(currentPage: Page, allPages: Page[]): Page | null {
    if (!allPages || allPages.length === 0)
        return null;

    const currentPageIndex = allPages.findIndex(page => page.id === currentPage.id)
    if (currentPageIndex === allPages.length - 1)
        return null;
    else if (currentPageIndex < 0)
        console.error("The current page is not found in the list of all pages.");

    // Sort the pages just in case they are not already sorted
    const sortedAllPages = allPages.sort((a, b) => a.order - b.order);
    return sortedAllPages[currentPageIndex + 1];
}
