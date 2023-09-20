import React from 'react';
import { useState, useEffect, ReactNode } from "react";
import { getPages } from "../../api/api";
import { Marcher, Page } from "../../types";
import { useSelectedPage } from "../../context/SelectedPageContext";
import { useSelectedMarcher } from "../../context/SelectedMarcherContext";
import { typeIndentifiers } from '../../types';

// export const handleItemClick = (item: Page | Marcher | null, setSelectedItem: , selectedItem: Page | Marcher): void => {
//     if (item) {
//         if (item.type === typeIndentifiers.Marcher) {
//             const { selectedMarcher, setSelectedMarcher } = useSelectedMarcher()!;
//             // Reset the previously selected marcher to white
//             if (selectedMarcher)
//                 document.getElementById(selectedMarcher?.id)!.className = "";
//             setSelectedMarcher(item);
//         }
//         else if (item.type === typeIndentifiers.Page) {
//             const { selectedPage, setSelectedPage } = useSelectedPage()!;
//             // Reset the previously selected marcher to white
//             if (selectedPage)
//                 document.getElementById(selectedPage.id)!.className = "";
//             setSelectedPage(item);
//         }
//         // Change the selected item to the selected color
//         document.getElementById(item.id)!.className = "table-info";
//     }
// };
let childData: { header: string, attributes: string[] } | null = null;
export const handleChildData = (data: { header: string, attributes: string[] }) => {
    childData = data;
};

export function ListContainer({ children, header }: { children: ReactNode, header: string }) {
    const [pages, setPages] = useState<Page[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    // TODO does this need to be a state function if the child data never changes?
    // const [childData, setChildData] = useState<{ header: string, attributes: string[] } | null>();

    useEffect(() => {
        getPages().then((pagesResponse: Page[]) => {
            setPages(pagesResponse);
        }).finally(() => {
            setIsLoading(false)
        });
    }
        , []);


    return (
        <>
            <h2>{childData?.header}</h2>
            <div className="list-container">
                <div className="conatiner text-left --bs-primary">
                    <div className="row">
                        {childData?.attributes.map((attribute) => (
                            <div className="col table-header">{attribute}</div>
                        ))}
                        <div className="col table-header">#</div>
                        <div className="col table-header">Counts</div>
                    </div>
                </div>
                <div className="scrollable">
                    <table className="table table-sm table-hover">
                        <tbody>
                            {/* {React.Children.map(children, (child) => {

                                if (React.isValidElement(child)) {
                                    return React.cloneElement(child, { handleItemClick });
                                }
                                return child;
                            })} */}
                            {children}
                        </tbody>
                    </table>
                </div>
            </div >
        </>
    );
}

