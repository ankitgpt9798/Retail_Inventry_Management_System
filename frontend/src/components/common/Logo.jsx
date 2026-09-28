import { Boxes } from "lucide-react";
import { Link } from "react-router-dom";

// The RetailFlow name + icon, used in both headers
const Logo = ({ to = "/" }) => {
    return (
        <Link to={to} className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-content">
                <Boxes size={20} aria-hidden="true" />
            </span>
            RetailFlow
        </Link>
    );
};

export default Logo;
