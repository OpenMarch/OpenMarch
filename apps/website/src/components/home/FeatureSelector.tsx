import { useState, useEffect } from "react";
import * as Accordion from "@radix-ui/react-accordion";
import { getImage } from "astro:assets";

async function getOptimizedImage(src: string) {
    return await getImage({
        src: src,
        width: 1920,
        height: 1080,
        format: "webp",
    });
}

export default function FeatureSelector() {
    const [selected, setSelected] = useState<string>("drill");
    const [optimizedImages, setOptimizedImages] = useState<
        Record<string, string>
    >({});

    useEffect(() => {
        const loadImages = async () => {
            try {
                const images = {
                    music: (await getOptimizedImage("/landing/music.png")).src,
                    fields: (await getOptimizedImage("/landing/fields.png"))
                        .src,
                    modern: (await getOptimizedImage("/landing/modern.png"))
                        .src,
                };
                setOptimizedImages(images);
            } catch (error) {
                console.error("Error loading images:", error);
            }
        };

        loadImages();
    }, []);
    return (
        <section
            id="features"
            className="text-text relative grid h-screen grid-cols-3 items-center gap-32 max-[1250px]:h-fit max-[1250px]:grid-cols-1"
        >
            <div className="col-span-1 flex flex-col gap-12">
                <h1 className="text-h1">Features</h1>
                <Accordion.Root
                    className="flex min-w-0 flex-col gap-12"
                    type="single"
                    defaultValue="drill"
                    onValueChange={(value) => setSelected(value)}
                >
                    <Accordion.Item value="drill">
                        <Accordion.Trigger className="rounded-6 border-stroke bg-fg-1 data-[state=closed]:hover:border-accent flex w-full flex-col gap-12 border p-24 transition-all duration-150 data-[state=closed]:border-transparent data-[state=closed]:bg-transparent data-[state=closed]:opacity-50">
                            <h2 className="text-h2 max-[550px]:text-h3 text-left">
                                Drill writing
                            </h2>
                            <Accordion.Content className="text-body text-left">
                                Create shapes with curves and lines via SVG
                                segments.
                            </Accordion.Content>
                        </Accordion.Trigger>
                    </Accordion.Item>

                    <Accordion.Item value="music">
                        <Accordion.Trigger className="rounded-6 border-stroke bg-fg-1 data-[state=closed]:hover:border-accent flex w-full flex-col gap-12 border p-24 transition-all duration-150 data-[state=closed]:border-transparent data-[state=closed]:bg-transparent data-[state=closed]:opacity-50">
                            <h2 className="text-h2 max-[550px]:text-h3 text-left">
                                Music integration
                            </h2>
                            <Accordion.Content className="text-body text-left">
                                Bring your MusicXML and audio files to write
                                your drill on top of.
                            </Accordion.Content>
                        </Accordion.Trigger>
                    </Accordion.Item>
                    <Accordion.Item value="fields">
                        <Accordion.Trigger className="rounded-6 border-stroke bg-fg-1 data-[state=closed]:hover:border-accent flex w-full flex-col gap-12 border p-24 transition-all duration-150 data-[state=closed]:border-transparent data-[state=closed]:bg-transparent data-[state=closed]:opacity-50">
                            <h2 className="text-h2 max-[550px]:text-h3 text-left">
                                Any field
                            </h2>
                            <Accordion.Content className="text-body text-left">
                                Use any field type you want, even custom ones.
                                High school, college, pro, indoor, or anything
                                else.
                            </Accordion.Content>
                        </Accordion.Trigger>
                    </Accordion.Item>
                    <Accordion.Item value="modern">
                        <Accordion.Trigger className="rounded-6 border-stroke bg-fg-1 data-[state=closed]:hover:border-accent flex w-full flex-col gap-12 border p-24 transition-all duration-150 data-[state=closed]:border-transparent data-[state=closed]:bg-transparent data-[state=closed]:opacity-50">
                            <h2 className="text-h2 max-[550px]:text-h3 text-left">
                                Fast, modern, free
                            </h2>
                            <Accordion.Content className="text-body text-left">
                                Built with beautiful design and performance, all
                                open source.
                            </Accordion.Content>
                        </Accordion.Trigger>
                    </Accordion.Item>
                </Accordion.Root>
            </div>
            {selected === "drill" && (
                <video
                    src="/landing/drill.webm"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="rounded-6 border-stroke col-span-2 aspect-video h-auto w-full border-2 object-cover max-[1250px]:col-span-1"
                />
            )}
            {selected === "music" && (
                <img
                    src={optimizedImages.music}
                    width={1920}
                    height={1080}
                    alt="Drill writing app"
                    className="rounded-6 border-stroke col-span-2 aspect-video h-auto w-full border-2 object-cover max-[1250px]:col-span-1"
                />
            )}
            {selected === "fields" && (
                <img
                    src={optimizedImages.fields}
                    width={1920}
                    height={1080}
                    alt="Drill writing app"
                    className="rounded-6 border-stroke col-span-2 aspect-video h-auto w-full border-2 object-cover max-[1250px]:col-span-1"
                />
            )}
            {selected === "modern" && (
                <img
                    src={optimizedImages.modern}
                    width={1920}
                    height={1080}
                    alt="Drill writing app"
                    className="rounded-6 border-stroke col-span-2 aspect-video h-auto w-full border-2 object-cover max-[1250px]:col-span-1"
                />
            )}
            <div className="bg-accent intersect:motion-preset-fade-lg absolute bottom-0 left-1/2 -z-50 h-[18vw] w-[22vw] -translate-x-1/2 rounded-full opacity-40 blur-[512px]"></div>
        </section>
    );
}
