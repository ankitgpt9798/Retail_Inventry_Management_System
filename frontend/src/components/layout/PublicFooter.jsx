import { Link } from "react-router-dom";
import Logo from "../common/Logo";
import { SITE_CONTACT } from "../../utils/siteInfo";

const PublicFooter = () => {
    return (
        <footer className="border-t border-base-300 bg-base-200">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-3">
                    <Logo />
                    <p className="text-sm text-base-content/70">
                        Multi-warehouse inventory, orders and purchasing for retail teams.
                    </p>
                </div>

                <div>
                    <h2 className="mb-3 text-sm font-semibold">Product</h2>
                    <ul className="space-y-2 text-sm text-base-content/70">
                        <li><Link to="/features" className="hover:text-base-content">Features</Link></li>
                        <li><Link to="/features#roles" className="hover:text-base-content">Roles &amp; access</Link></li>
                    </ul>
                </div>

                <div>
                    <h2 className="mb-3 text-sm font-semibold">Company</h2>
                    <ul className="space-y-2 text-sm text-base-content/70">
                        <li><Link to="/about" className="hover:text-base-content">About</Link></li>
                        <li><Link to="/contact" className="hover:text-base-content">Contact</Link></li>
                    </ul>
                </div>

                <div>
                    <h2 className="mb-3 text-sm font-semibold">Account</h2>
                    <ul className="space-y-2 text-sm text-base-content/70">
                        <li><Link to="/login" className="hover:text-base-content">Log in</Link></li>
                        <li><Link to="/register" className="hover:text-base-content">Request access</Link></li>
                        <li>{SITE_CONTACT.email}</li>
                    </ul>
                </div>
            </div>
            <div className="border-t border-base-300 py-4 text-center text-xs text-base-content/60">
                © {new Date().getFullYear()} RetailFlow. All rights reserved.
            </div>
        </footer>
    );
};

export default PublicFooter;
