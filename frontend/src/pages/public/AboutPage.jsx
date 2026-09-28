import { Eye, Lock, Scale } from "lucide-react";

const PRINCIPLES = [
    {
        icon: Scale,
        title: "Numbers you can trust",
        text: "Stock changes happen in single, checked steps. Two people can't sell or move the same unit at the same moment."
    },
    {
        icon: Eye,
        title: "Nothing happens silently",
        text: "Every important change is recorded — who did it, when, and what it was before — and kept permanently."
    },
    {
        icon: Lock,
        title: "The right access for each role",
        text: "Passwords are never stored in readable form, sessions use secure cookies, and every request is checked on the server."
    }
];

const TECHNOLOGY = ["React", "Redux Toolkit", "Tailwind CSS", "Node.js", "Express", "MongoDB"];

const AboutPage = () => {
    return (
        <>
            <section className="bg-base-200">
                <div className="mx-auto max-w-4xl px-4 py-16">
                    <h1 className="text-4xl font-extrabold tracking-tight">About RetailFlow</h1>
                    <p className="mt-4 text-lg text-base-content/75">
                        RetailFlow is an inventory management system for retail businesses that run more than one
                        warehouse. It connects the catalog, stock, transfers, customer orders, suppliers and purchasing,
                        so that every team works from the same, up-to-date numbers.
                    </p>
                </div>
            </section>

            <section className="mx-auto max-w-4xl px-4 py-16">
                <h2 className="text-2xl font-bold">What we care about</h2>
                <div className="mt-8 space-y-6">
                    {PRINCIPLES.map((principle) => (
                        <div key={principle.title} className="flex gap-4">
                            <principle.icon className="mt-1 shrink-0 text-primary" size={26} aria-hidden="true" />
                            <div>
                                <h3 className="font-semibold">{principle.title}</h3>
                                <p className="mt-1 text-base-content/70">{principle.text}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <h2 className="mt-16 text-2xl font-bold">Built with</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                    {TECHNOLOGY.map((name) => (
                        <span key={name} className="badge badge-outline badge-lg">{name}</span>
                    ))}
                </div>
            </section>
        </>
    );
};

export default AboutPage;
