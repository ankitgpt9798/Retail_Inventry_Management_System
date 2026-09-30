import { Link } from "react-router-dom";
import Logo from "../common/Logo";
import { SITE_CONTACT } from "../../utils/siteInfo";

const FOOTER_COLUMNS = [
    {
        title: "Product",
        links: [
            { to: "/#features", label: "Features" },
            { to: "/#workflow", label: "How it works" },
            { to: "/#roles", label: "Roles & access" }
        ]
    },
    {
        title: "Support",
        links: [
            { to: "/contact", label: "Contact us" },
            { to: "/register", label: "Request access" }
        ]
    },
    {
        title: "Account",
        links: [
            { to: "/login", label: "Log in" },
            { to: "/register", label: "Get started" }
        ]
    }
];

const PublicFooter = () => {
    return (
        <footer className="border-t border-base-300 bg-base-100">
            <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
                <div className="space-y-3 lg:col-span-2">
                    <Logo />
                    <p className="max-w-xs text-sm text-base-content/60">
                        Multi-warehouse inventory, orders and purchasing for growing retail teams.
                    </p>
                    <p className="text-sm text-base-content/60">{SITE_CONTACT.email}</p>
                </div>

                {FOOTER_COLUMNS.map((column) => (
                    <div key={column.title}>
                        <h2 className="mb-3 text-sm font-semibold">{column.title}</h2>
                        <ul className="space-y-2 text-sm text-base-content/60">
                            {column.links.map((link) => (
                                <li key={link.label}>
                                    <Link to={link.to} className="hover:text-primary">
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            <div className="border-t border-base-300 py-5 text-center text-xs text-base-content/50">
                © {new Date().getFullYear()} RetailFlow. All rights reserved.
            </div>
        </footer>
    );
};

export default PublicFooter;
