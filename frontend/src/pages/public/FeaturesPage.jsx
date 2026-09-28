import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { MODULES, ROLE_DESCRIPTIONS } from "./content";

const FeaturesPage = () => {
    return (
        <>
            <section className="bg-base-200">
                <div className="mx-auto max-w-6xl px-4 py-16">
                    <h1 className="text-4xl font-extrabold tracking-tight">Features</h1>
                    <p className="mt-3 max-w-2xl text-lg text-base-content/70">
                        Nine connected modules that follow your stock from supplier to customer.
                    </p>
                </div>
            </section>

            <section className="mx-auto max-w-6xl space-y-6 px-4 py-16">
                {MODULES.map((module) => (
                    <article key={module.title} className="grid gap-4 rounded-box border border-base-300 p-6 md:grid-cols-3">
                        <div className="md:col-span-1">
                            <module.icon className="text-primary" size={30} aria-hidden="true" />
                            <h2 className="mt-3 text-xl font-semibold">{module.title}</h2>
                            <p className="mt-2 text-base-content/70">{module.summary}</p>
                        </div>
                        <ul className="space-y-2 self-center md:col-span-2">
                            {module.details.map((detail) => (
                                <li key={detail} className="flex items-start gap-2">
                                    <Check size={18} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                                    <span>{detail}</span>
                                </li>
                            ))}
                        </ul>
                    </article>
                ))}
            </section>

            <section id="roles" className="bg-base-200">
                <div className="mx-auto max-w-6xl px-4 py-16">
                    <h2 className="text-3xl font-bold tracking-tight">Roles &amp; access</h2>
                    <p className="mt-3 max-w-2xl text-base-content/70">
                        Every action is checked on the server against the user's role, and important actions are
                        recorded in the audit trail.
                    </p>
                    <div className="mt-8 grid gap-6 sm:grid-cols-2">
                        {ROLE_DESCRIPTIONS.map((role) => (
                            <div key={role.title} className="rounded-box bg-base-100 p-6">
                                <role.icon className="text-secondary" size={24} aria-hidden="true" />
                                <h3 className="mt-3 font-semibold">{role.title}</h3>
                                <p className="mt-2 text-sm text-base-content/70">{role.text}</p>
                            </div>
                        ))}
                    </div>
                    <Link to="/register" className="btn btn-primary mt-10">Request access</Link>
                </div>
            </section>
        </>
    );
};

export default FeaturesPage;
