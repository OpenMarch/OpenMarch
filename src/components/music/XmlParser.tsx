import JSZip from "jszip";
import { useEffect, useState } from "react"

export default function XmlParser() {
    const [xmlFile, setXmlFile] = useState<File | null>(null);

    useEffect(() => {
        if (!xmlFile) return;

        console.log('jeff')

        // Unzip if a .mxl file.
        // THIS IS VERY JANK, probably a better way to do this
        if (xmlFile.name.endsWith(".mxl")) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                const zip = await JSZip.loadAsync(arrayBuffer);
                const files = zip.file(/.xml/);
                const unzippedContents: Record<string, string> = {};
                await Promise.all(files.map(async (file) => {
                    const content = await file.async("string");
                    unzippedContents[file.name] = content;
                }));
                const scoreKey = Object.keys(unzippedContents).find((key) => key !== "META-INF/container.xml");
                if (!scoreKey) {
                    console.error("No score found in MXL file");
                    return;
                }
                const xmlContent = unzippedContents[scoreKey];
                console.log(xmlContent);
            };
            reader.readAsArrayBuffer(xmlFile);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                const xmlContent = e.target?.result as string;
                console.log(xmlContent);
            };
            reader.readAsText(xmlFile);
        }
    }, [xmlFile]);

    return (
        <div>
            <label htmlFor="musicXML-uploader" className="btn-secondary">Upload MusicXML</label>
            <input placeholder="" className="hidden" type="file" id='musicXML-uploader' onChange={(e) => setXmlFile(e.target.files?.[0] || null)} accept=".xml,.mxl,.musicxml" />
        </div>
    )
}
