import * as Accordion from "@radix-ui/react-accordion";
import { CaretDownIcon } from "@phosphor-icons/react";

const faqs = [
    {
        question: "What is OpenMarch: On The Move?",
        answer: (
            <>
                <p>
                    <em>OpenMarch: On The Move</em> is a mobile drill viewer app
                    for marching band and marching arts performers. The app
                    allows students to watch drill animations, scrub through the
                    show timeline, and view their exact position on the field.
                </p>
                <p>
                    Unlike traditional paper coordinate sheets, On The Move
                    allows performers to see the full drill design and
                    understand the big picture of the show. Students can study
                    drill movements, learn sets faster, and visualize how forms
                    develop across the field.
                </p>
            </>
        ),
    },
    {
        question: "Who is OpenMarch: On The Move designed for?",
        answer: (
            <>
                <p>
                    <em>OpenMarch: On The Move</em> is built for performers and
                    instructional staff who want a faster and clearer way to
                    understand drill.
                </p>
                <p>
                    This app supports performers across the marching arts,
                    including:
                </p>
                <ul className="list-disc pl-20">
                    <li>Marching band students</li>
                    <li>Drum corps performers</li>
                    <li>Indoor percussion, guard, and winds ensembles</li>
                </ul>
                <p>
                    Students can use the app to watch drill animations, study
                    their coordinates, and learn sets faster by seeing how forms
                    develop across the field.
                </p>
                <p>
                    On The Move is also a powerful educational tool for
                    directors, visual staff, and section leaders. Staff members
                    can quickly check student positions, review drill sets, and
                    visualize transitions in real time. This makes it easier to
                    teach spacing, fix form issues, and help performers
                    understand their role within the full drill design.
                </p>
            </>
        ),
    },
    {
        question: "What devices support the On The Move app?",
        answer: (
            <>
                <p>
                    <em>OpenMarch: On The Move</em> is available on both iOS and
                    Android devices.
                </p>
                <p>
                    Students can use their smartphone to view drill animations,
                    review their drill sets, and study their marching
                    coordinates anywhere.
                </p>
            </>
        ),
    },
    {
        question: "How do students get their drill in the app?",
        answer: (
            <>
                <p>Directors upload drill files through the OpenMarch Cloud.</p>
                <p>
                    Once a student opens the file in the app, they can
                    immediately begin viewing their marching band drill
                    animation and coordinates.
                </p>
            </>
        ),
    },
    {
        question: "Do students/performers need to create an account?",
        answer: (
            <>
                <p>
                    No. Students/performers do not need to create accounts, and
                    OpenMarch does not collect student/performer information.
                </p>
                <p>
                    Performers simply download the app, enter their ensemble ID,
                    and open the drill file provided by their ensemble.
                </p>
            </>
        ),
    },
    {
        question: "Is OpenMarch: On The Move free?",
        answer: (
            <>
                <p>
                    <em>OpenMarch: On The Move</em> uses a per-seat licensing
                    model for ensembles, but performers do not pay individually
                    to use the app. For the Fall 2026 season, each ensemble
                    receives 10 free seats. Subsequent seats are purchased by
                    the ensemble or program.
                </p>
                <p>
                    Students simply download the app on iOS or Android, open the
                    drill file provided by their ensemble, and begin viewing
                    their drill.
                </p>
                <p>
                    Licenses allow performers to access the drill viewer without
                    needing to create accounts or submit personal information.
                </p>
                <p>
                    This approach keeps the app accessible for students while
                    giving ensembles a simple way to manage access for their
                    performers.
                </p>
            </>
        ),
    },
    {
        question: "What can students do inside the drill viewer?",
        answer: (
            <>
                <p>Inside the On The Move drill viewer app, students can:</p>
                <ul className="list-disc pl-20">
                    <li>Watch the full marching band drill animation</li>
                    <li>Scrub through the drill timeline</li>
                    <li>View drill set by set</li>
                    <li>See their individual marching dot highlighted</li>
                    <li>Study how drill forms evolve across the field</li>
                </ul>
                <p>
                    This helps performers better understand the visual design of
                    the show, not just their individual coordinates.
                </p>
            </>
        ),
    },
    {
        question: "Does the app work offline?",
        answer: (
            <>
                <p>
                    Yes. Once a drill file has been downloaded, the app can be
                    used without an internet connection.
                </p>
                <p>
                    Students can review their drill animation and coordinates
                    anywhere, including at rehearsal, at home, or while
                    traveling.
                </p>
            </>
        ),
    },
    {
        question: "What drill file types does On The Move support?",
        answer: (
            <>
                <p>Currently, On The Move supports OpenMarch `.dots` files.</p>
                <p>
                    OpenMarch also includes a PDF converter that allows you to
                    import files from other tools, such as Pyware, into
                    OpenMarch. Directors can convert traditional coordinate
                    sheets into drill files that can be opened in{" "}
                    <em>OpenMarch: On The Move</em>.
                </p>
            </>
        ),
    },
];

export default function FAQAccordion() {
    return (
        <Accordion.Root
            type="single"
            collapsible
            className="flex w-full flex-col gap-8"
        >
            {faqs.map((faq) => (
                <Accordion.Item
                    key={faq.question}
                    value={faq.question}
                    className="border-stroke bg-fg-1 rounded-6 border"
                >
                    <Accordion.Header>
                        <Accordion.Trigger className="text-text group text-body flex w-full items-center justify-between gap-16 px-24 py-18 text-left">
                            <span>{faq.question}</span>
                            <CaretDownIcon
                                size={20}
                                className="text-text-subtitle shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180"
                                aria-hidden="true"
                            />
                        </Accordion.Trigger>
                    </Accordion.Header>
                    <Accordion.Content className="overflow-hidden">
                        <div className="text-text-subtitle text-body flex flex-col gap-12 px-24 pb-20 leading-relaxed">
                            {faq.answer}
                        </div>
                    </Accordion.Content>
                </Accordion.Item>
            ))}
        </Accordion.Root>
    );
}
