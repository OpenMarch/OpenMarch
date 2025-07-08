import React from "react";
import ReactJson from "react-json-view";

interface StoreTabProps {
    title: string;
    data: unknown;
}

const StoreTab: React.FC<StoreTabProps> = ({ title, data }) => {
    return (
        <details className="bg-fg-1 border-stroke mb-2 rounded-md border">
            <summary className="text-text text-body block cursor-pointer p-2 font-bold">
                {title}
            </summary>
            <div className="mx-3 mb-3 rounded-sm p-3">
                <ReactJson
                    src={data as object}
                    name={false}
                    collapsed={2}
                    enableClipboard={false}
                    displayDataTypes={false}
                    displayObjectSize={false}
                    indentWidth={1}
                    theme="monokai"
                    style={{ fontSize: "0.85em" }}
                />
            </div>
        </details>
    );
};

export default StoreTab;
