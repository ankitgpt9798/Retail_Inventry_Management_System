import {
    ArrowRight,
    BellRing,
    Boxes,
    CircleCheck,
    ClipboardCheck,
    IndianRupee,
    PackageCheck,
    ShieldCheck,
    ShoppingBag,
    TriangleAlert,
    Truck,
    Warehouse
} from "lucide-react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Badge from "../../components/common/Badge";
import { MODULES, ROLE_DESCRIPTIONS } from "./content";
import { getHomePath } from "../../utils/navigation";

// The public landing page: hero, features, dashboard preview, inventory highlights,
// how it works, roles and a call to action — all on one page ("/#features", "/#workflow" jump to sections).
// The numbers in the two previews are an ILLUSTRATION of the app, not live data.

const HIGHLIGHTS = [
    { icon: Warehouse, text: "Multi-warehouse stock" },
    { icon: ShieldCheck, text: "Role-based access" },
    { icon: BellRing, text: "Low-stock alerts" }
];

const WORKFLOW = [
    { icon: Truck, title: "Receive", text: "Purchase orders are approved, confirmed by the supplier and received — even in several deliveries." },
    { icon: Warehouse, title: "Store", text: "Stock is kept per warehouse, with capacity limits and transfers between locations." },
    { icon: ShoppingBag, title: "Sell", text: "Orders reserve stock the moment they're confirmed, so a unit is never promised twice." },
    { icon: TriangleAlert, title: "Reorder", text: "When stock falls below its reorder level, managers are alerted and can reorder in minutes." }
];

const BENEFITS = [
    "Every stock change is recorded with who, when and why",
    "Prices and tax are calculated by the server, not typed in",
    "Suppliers confirm orders in their own portal",
    "Reports on revenue, stock value and best sellers"
];

// Preview data for the illustration only
const PREVIEW_KPIS = [
    { label: "Stock value", value: "₹7,49,913", icon: IndianRupee, tone: "bg-success-soft text-success" },
    { label: "Active products", value: "47", icon: Boxes, tone: "bg-primary-soft text-primary" },
    { label: "Low stock", value: "19", icon: TriangleAlert, tone: "bg-warning-soft text-warning" },
    { label: "To fulfil", value: "14", icon: PackageCheck, tone: "bg-info-soft text-info" }
];
const PREVIEW_BARS = [42, 58, 51, 67, 74, 88];
const PREVIEW_STOCK = [
    { name: "Basmati Rice 5 kg", sku: "GRO-101", stock: 186, tone: "success", label: "Healthy" },
    { name: "Wireless Optical Mouse", sku: "ELE-101", stock: 6, tone: "warning", label: "Low stock" },
    { name: "Pressure Cooker 5 L", sku: "HOM-104", stock: 0, tone: "error", label: "Out of stock" },
    { name: "Dishwash Liquid 750 ml", sku: "CLN-101", stock: 212, tone: "info", label: "Overstocked" }
];

const SectionHeading = ({ eyebrow, title, text, center = false }) => (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
        {text && <p className="mt-4 text-base-content/65 sm:text-lg">{text}</p>}
    </div>
);

const DashboardPreview = () => (
    <div className="rounded-2xl border border-base-300 bg-base-100 p-3 shadow-raised sm:p-4" role="img" aria-label="Preview of the StockFlow dashboard">
        <div className="flex items-center gap-1.5 pb-3" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-error/70"></span>
            <span className="size-2.5 rounded-full bg-warning/70"></span>
            <span className="size-2.5 rounded-full bg-success/70"></span>
        </div>
        <div className="rounded-xl bg-base-200 p-3 sm:p-4">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {PREVIEW_KPIS.map((kpi) => (
                    <div key={kpi.label} className="min-w-0 rounded-lg border border-base-300 bg-base-100 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-base-content/60">{kpi.label}</span>
                            <span className={`flex size-6 shrink-0 items-center justify-center rounded-md ${kpi.tone}`}>
                                <kpi.icon size={13} />
                            </span>
                        </div>
                        <p className="mt-1.5 text-lg font-bold tabular-nums sm:text-xl">{kpi.value}</p>
                    </div>
                ))}
            </div>
            <div className="mt-3 rounded-lg border border-base-300 bg-base-100 p-3">
                <p className="text-xs font-medium text-base-content/60">Revenue · last 6 months</p>
                <div className="mt-3 flex h-24 items-end gap-2 sm:gap-3">
                    {PREVIEW_BARS.map((height, index) => (
                        <div key={index} className="flex-1 rounded-t-md bg-primary/80" style={{ height: `${height}%` }}></div>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

const HomePage = () => {
    const user = useSelector((state) => state.auth.user);
    // Logged in → straight to the app; otherwise sign-up and login
    const dashboardPath = user ? getHomePath(user.role) : "/login";
    const startPath = user ? getHomePath(user.role) : "/register";

    return (
        <>
            {/* ---------- Hero ---------- */}
            <section className="relative overflow-hidden bg-gradient-to-b from-primary-soft via-base-100 to-base-100">
                <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:px-8 lg:py-24">
                    <div className="min-w-0">
                        <Badge tone="primary">Retail inventory management</Badge>
                        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                            Manage Your Inventory <span className="text-primary">Smarter</span>
                        </h1>
                        <p className="mt-5 max-w-xl text-lg text-base-content/70">
                            StockFlow keeps products, stock, warehouses, orders and suppliers in one place — so your team always
                            knows what's on the shelf, what's promised and what's on the way.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Link to={startPath} className="btn btn-primary btn-lg">
                                Get Started <ArrowRight size={18} aria-hidden="true" />
                            </Link>
                            <Link to={dashboardPath} className="btn btn-lg">
                                Go to Dashboard
                            </Link>
                        </div>
                        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-base-content/70">
                            {HIGHLIGHTS.map((item) => (
                                <li key={item.text} className="flex items-center gap-2">
                                    <item.icon size={16} className="text-primary" aria-hidden="true" />
                                    {item.text}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <DashboardPreview />
                </div>
            </section>

            {/* ---------- Features ---------- */}
            <section id="features" className="scroll-mt-20 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
                <SectionHeading
                    eyebrow="Features"
                    title="Everything your stock goes through"
                    text="From the moment a product is added to the moment it reaches a customer, each step is recorded and checked."
                />
                <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {MODULES.map((module) => (
                        <article key={module.title} className="rounded-xl border border-base-300 bg-base-100 p-6 shadow-card transition-shadow hover:shadow-raised">
                            <span className="flex size-11 items-center justify-center rounded-lg bg-primary-soft text-primary">
                                <module.icon size={22} aria-hidden="true" />
                            </span>
                            <h3 className="mt-4 text-lg font-semibold">{module.title}</h3>
                            <p className="mt-2 text-sm text-base-content/65">{module.summary}</p>
                            <ul className="mt-4 space-y-1.5 text-sm text-base-content/70">
                                {module.details.map((detail) => (
                                    <li key={detail} className="flex gap-2">
                                        <CircleCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                                        {detail}
                                    </li>
                                ))}
                            </ul>
                        </article>
                    ))}
                </div>
            </section>

            {/* ---------- Inventory highlight ---------- */}
            <section className="bg-base-200">
                <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8">
                    <div className="order-2 min-w-0 space-y-3 lg:order-1" role="img" aria-label="Preview of stock cards with their stock status">
                        {PREVIEW_STOCK.map((item) => (
                            <div key={item.sku} className="flex items-center gap-4 rounded-xl border border-base-300 bg-base-100 p-4 shadow-card">
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                                    <Boxes size={20} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">{item.name}</p>
                                    <p className="font-mono text-xs text-base-content/55">{item.sku}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <Badge tone={item.tone}>{item.label}</Badge>
                                    <span className="text-xs text-base-content/60 tabular-nums">{item.stock} in stock</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="order-1 lg:order-2">
                        <SectionHeading
                            eyebrow="Inventory & products"
                            title="See every product's stock at a glance"
                            text="Each product in each warehouse shows its stock, reorder level and value, with a clear status: healthy, low, out of stock or overstocked."
                        />
                        <ul className="mt-6 space-y-3">
                            {["Search by name, SKU or brand", "Filter by category, warehouse and stock status", "Stock in, stock out and transfers in two clicks"].map((text) => (
                                <li key={text} className="flex gap-3 text-base-content/75">
                                    <ClipboardCheck size={20} className="shrink-0 text-primary" aria-hidden="true" />
                                    {text}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </section>

            {/* ---------- How it works ---------- */}
            <section id="workflow" className="scroll-mt-20 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
                <SectionHeading eyebrow="How it works" title="One simple cycle, every day" center />
                <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {WORKFLOW.map((step, index) => (
                        <li key={step.title} className="relative rounded-xl border border-base-300 bg-base-100 p-6 shadow-card">
                            <span className="text-xs font-semibold text-primary">Step {index + 1}</span>
                            <step.icon className="mt-3 text-base-content/80" size={28} aria-hidden="true" />
                            <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                            <p className="mt-2 text-sm text-base-content/65">{step.text}</p>
                        </li>
                    ))}
                </ol>
                <ul className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-2">
                    {BENEFITS.map((benefit) => (
                        <li key={benefit} className="flex gap-2 text-sm text-base-content/75">
                            <CircleCheck size={18} className="shrink-0 text-success" aria-hidden="true" />
                            {benefit}
                        </li>
                    ))}
                </ul>
            </section>

            {/* ---------- Roles ---------- */}
            <section id="roles" className="scroll-mt-20 bg-base-200">
                <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
                    <SectionHeading eyebrow="Built for the whole team" title="Everyone sees what they need — and only that" text="Access is managed by your administrator." />
                    <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        {ROLE_DESCRIPTIONS.map((role) => (
                            <div key={role.title} className="rounded-xl border border-base-300 bg-base-100 p-6 shadow-card">
                                <role.icon className="text-primary" size={26} aria-hidden="true" />
                                <h3 className="mt-3 font-semibold">{role.title}</h3>
                                <p className="mt-2 text-sm text-base-content/65">{role.text}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ---------- Call to action ---------- */}
            <section className="px-4 py-20 sm:px-6 lg:px-8">
                <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 rounded-2xl bg-neutral px-6 py-12 text-neutral-content sm:px-10 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-2xl font-bold sm:text-3xl">Ready to take control of your stock?</h2>
                        <p className="mt-2 text-neutral-content/75">Request access and your administrator will approve it — or log in if you already have an account.</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link to={startPath} className="btn btn-primary">
                            Get Started <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                        <Link to="/contact" className="btn border-white/20 bg-white/10 text-neutral-content hover:bg-white/20">
                            Talk to us
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
};

export default HomePage;
