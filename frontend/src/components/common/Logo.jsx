import { Link } from "react-router-dom";

// The StockFlow mark: a simple box (cube) drawn as an inline SVG, so no image file is needed
const LogoMark = () => {
    return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {/* Outline of the box */}
            <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7L12 2.5Z" />
            {/* Top face edges meeting in the centre */}
            <path d="M3.5 7 12 11.5 20.5 7" />
            <path d="M12 11.5v10" />
            {/* Filled top face for a bit of depth */}
            <path d="M12 2.5 20.5 7 12 11.5 3.5 7 12 2.5Z" fill="currentColor" fillOpacity="0.35" stroke="none" />
        </svg>
    );
};

// The StockFlow name + icon, used in the headers, sidebar and footer.
// showSubtitle adds "Retail Inventory Management System" under the name (used on the public site).
const Logo = ({ to = "/", showSubtitle = false }) => {
    return (
        <Link to={to} className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-content">
                <LogoMark />
            </span>
            <span className="leading-tight">
                <span className="block">StockFlow</span>
                {showSubtitle && (
                    <span className="block text-[11px] font-medium tracking-normal text-base-content/55">Retail Inventory Management System</span>
                )}
            </span>
        </Link>
    );
};

export default Logo;
