/**
 * Creates page names based on an ordered list of subset flags.
 *
 * For example, [false, false, true, false, true, true, false] becomes
 * ["1", "2", "2A", "3", "3A", "3B", "4"]. The first page always uses
 * the page number offset, regardless of the first subset flag.
 */
export const generatePageNames = (
    isSubsetArr: boolean[],
    pageNumberOffset: number = 0,
): string[] => {
    const pageNames: string[] = [pageNumberOffset.toString()];
    let curPageNumber = pageNumberOffset;
    let curSubsetLetter = "";

    const incrementLetters = (letters: string) => {
        let result = [];
        let carry = true;
        const capitalizedLetters = letters.toUpperCase();

        for (let i = capitalizedLetters.length - 1; i >= 0; i--) {
            const char = capitalizedLetters[i]!;
            if (carry) {
                if (char === "Z") {
                    result.push("A");
                } else {
                    result.push(String.fromCharCode(char.charCodeAt(0) + 1));
                    carry = false;
                }
            } else {
                result.push(char);
            }
        }

        if (carry) result.push("A");
        return result.reverse().join("");
    };

    const getNextPageName = ({
        pageNumber,
        subsetString,
        incrementSubset = false,
    }: {
        pageNumber: number;
        subsetString: string | null;
        incrementSubset?: boolean;
    }) => {
        let newPageNumber = pageNumber;
        let newSubsetString = subsetString || "";

        if (incrementSubset) {
            if (!subsetString || subsetString === "") newSubsetString = "A";
            else newSubsetString = incrementLetters(subsetString);
        } else {
            newPageNumber = pageNumber + 1;
            newSubsetString = "";
        }

        return newPageNumber + newSubsetString;
    };

    for (let i = 1; i < isSubsetArr.length; i++) {
        const pageName = getNextPageName({
            pageNumber: curPageNumber,
            subsetString: isSubsetArr[i] ? curSubsetLetter : null,
            incrementSubset: isSubsetArr[i],
        });
        pageNames.push(pageName);

        if (isSubsetArr[i]) {
            curSubsetLetter = incrementLetters(curSubsetLetter);
        } else {
            curPageNumber++;
            curSubsetLetter = "";
        }
    }

    return pageNames;
};

/**
 * Returns the numeric part of the last page name for an ordered subset list.
 *
 * This is the last named page number, e.g. 3 from "3" or "3B", not the page count.
 */
export const getLastPageNumber = (
    isSubsetArr: boolean[],
    pageNumberOffset: number = 0,
): number => {
    if (isSubsetArr.length === 0) return pageNumberOffset;

    const pageNames = generatePageNames(isSubsetArr, pageNumberOffset);
    const lastName = pageNames[pageNames.length - 1]!;
    const match = lastName.match(/^(-?\d+)/);
    if (!match) return pageNumberOffset;
    return parseInt(match[1]!, 10);
};
