import { ArrowRight, CircleCheck, PackageCheck, ShoppingBag, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { MODULES, ROLE_DESCRIPTIONS } from "./content";

// The three steps of the everyday cycle, shown in "How it works"
const CYCLE = [
    {
        icon: PackageCheck,
        title: "Receive stock",
        text: "Goods arrive from suppliers or other warehouses and are counted into the right location."
    },
    {
        icon: ShoppingBag,
        title: "Sell with confidence",
        text: "Orders reserve stock the moment they're confirmed, so the same unit is never promised twice."
    },
    {
        icon: TriangleAlert,
        title: "Reorder in time",
        text: "When stock falls below your reorder level, managers are alerted and can raise a purchase in minutes."
    }
];

const HomePage = () => {
    return (
        <>
            {/* Hero */}
            <section className="bg-gradient-to-b from-primary/10 via-base-100 to-base-100">
                <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2">
                    <div>
                        <span className="badge badge-primary badge-soft">Retail inventory management</span>
                        <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
                            Every unit, every warehouse, <span className="text-primary">one place.</span>
                        </h1>
                        <p className="mt-5 text-lg text-base-content/75">
                            RetailFlow keeps stock, transfers, customer orders and purchasing in step across all your
                            locations — so your team always knows what's on the shelf, what's promised and what's on the way.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link to="/login" className="btn btn-primary btn-lg">
                                Log in <ArrowRight size={18} aria-hidden="true" />
                            </Link>
                            <Link to="/features" className="btn btn-ghost btn-lg">See all features</Link>
                        </div>
                    </div>

                    {/* An illustration of the idea: one product, several warehouses, one total */}
                    <div className="card border border-base-300 bg-base-100 shadow-xl" aria-label="Example: stock of one product across warehouses">
                        <div className="card-body">
                            <p className="text-sm text-base-content/60">Example product</p>
                            <h2 className="card-title">Laptop · LAP-001</h2>
                            <div className="mt-2 space-y-3">
                                {[["Delhi", 100], ["Noida", 50], ["Mumbai", 75]].map(([city, quantity]) => (
                                    <div key={city}>
                                        <div className="flex justify-between text-sm">
                                            <span>{city} warehouse</span>
                                            <span className="font-semibold">{quantity}</span>
                                        </div>
                                        <progress className="progress progress-primary w-full" value={quantity} max="100"></progress>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-2 flex justify-between border-t border-base-300 pt-3 font-semibold">
                                <span>Total across warehouses</span>
                                <span>225</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Modules */}
            <section className="mx-auto max-w-6xl px-4 py-20">
                <div className="max-w-2xl">
                    <h2 className="text-3xl font-bold tracking-tight">Everything your stock goes through</h2>
                    <p className="mt-3 text-base-content/70">
                        From the moment a product is added to the moment it reaches a customer, each step is recorded and checked.
                    </p>
                </div>
                <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {MODULES.map((module) => (
                        <article key={module.title} className="card border border-base-300 bg-base-100 transition-shadow hover:shadow-md">
                            <div className="card-body">
                                <module.icon className="text-primary" size={28} aria-hidden="true" />
                                <h3 className="card-title text-lg">{module.title}</h3>
                                <p className="text-base-content/70">{module.summary}</p>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            {/* How it works */}
            <section className="bg-base-200">
                <div className="mx-auto max-w-6xl px-4 py-20">
                    <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
                    <ol className="mt-10 grid gap-8 md:grid-cols-3">
                        {CYCLE.map((step, index) => (
                            <li key={step.title} className="relative">
                                <span className="text-sm font-semibold text-primary">Step {index + 1}</span>
                                <step.icon className="mt-3" size={32} aria-hidden="true" />
                                <h3 className="mt-3 text-xl font-semibold">{step.title}</h3>
                                <p className="mt-2 text-base-content/70">{step.text}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* Roles */}
            <section className="mx-auto max-w-6xl px-4 py-20">
                <h2 className="text-3xl font-bold tracking-tight">Built for the whole team</h2>
                <p className="mt-3 max-w-2xl text-base-content/70">
                    Everyone sees what they need — and only that. Access is managed by your administrator.
                </p>
                <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {ROLE_DESCRIPTIONS.map((role) => (
                        <div key={role.title} className="rounded-box border border-base-300 p-6">
                            <role.icon className="text-secondary" size={26} aria-hidden="true" />
                            <h3 className="mt-3 font-semibold">{role.title}</h3>
                            <p className="mt-2 text-sm text-base-content/70">{role.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Call to action */}
            <section className="px-4 pb-20">
                <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-box bg-neutral px-8 py-12 text-neutral-content md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold">Ready to get started?</h2>
                        <ul className="mt-3 space-y-1 text-neutral-content/80">
                            <li className="flex items-center gap-2"><CircleCheck size={16} aria-hidden="true" /> Log in with the account your administrator created</li>
                            <li className="flex items-center gap-2"><CircleCheck size={16} aria-hidden="true" /> New to the team? Request access and get approved</li>
                        </ul>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link to="/register" className="btn btn-ghost border-neutral-content/30">Request access</Link>
                        <Link to="/login" className="btn btn-primary">Log in</Link>
                    </div>
                </div>
            </section>
        </>
    );
};

export default HomePage;
