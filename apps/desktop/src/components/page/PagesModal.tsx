import { useSidebarModalStore } from "@/stores/SidebarModalStore";
import { SidebarModalLauncher } from "@/components/sidebar/SidebarModal";
import { XIcon } from "@phosphor-icons/react";
import PageList from "./PageList";

export default function PagesModal() {
    return (
        <SidebarModalLauncher
            contents={<PageListContents />}
            buttonLabel="Pages"
        />
    );
}

export function PageListContents() {
    const { toggleOpen } = useSidebarModalStore();

    return (
        <div className="animate-scale-in text-text flex h-full w-fit flex-col gap-16">
            <header className="flex items-center justify-between gap-24">
                <h4 className="text-h4 leading-none">Pages</h4>
                <div className="flex items-center gap-8">
                    {/* <Button
                        onClick={() => {
                            setContent(<PageNewFormContents />);
                        }}
                        size="compact"
                    >
                        Add
                    </Button> */}
                    <button
                        onClick={toggleOpen}
                        className="hover:text-red duration-150 ease-out"
                    >
                        <XIcon size={24} />
                    </button>
                </div>
            </header>
            <hr />

            <div className="flex grow flex-col gap-16 overflow-scroll">
                <PageList />
            </div>
        </div>
    );
}
// Marcher add form
// export function PageNewFormContents() {
//     const { setContent, toggleOpen } = useSidebarModalStore();

//     return (
//         <div className="animate-scale-in text-text flex w-fit flex-col gap-16">
//             <header className="flex justify-between gap-24">
//                 <div className="flex items-center gap-8">
//                     <button
//                         onClick={() => {
//                             setContent(<PageListContents />);
//                         }}
//                         className="hover:text-accent duration-150 ease-out"
//                     >
//                         <CaretLeftIcon size={24} />
//                     </button>
//                     <h4 className="text-h4 leading-none">Add Pages</h4>
//                 </div>
//                 <button
//                     onClick={toggleOpen}
//                     className="hover:text-red duration-150 ease-out"
//                 >
//                     <XIcon size={24} />
//                 </button>
//             </header>
//             <NewPageForm />
//         </div>
//     );
// }
