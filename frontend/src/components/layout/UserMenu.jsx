import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { logoutUser } from "../../store/authSlice";
import useDropdown from "../../hooks/useDropdown";
import { formatRole } from "../../utils/roles";

// Initials for the round avatar: "Ravi Kumar" → "RK"
const getInitials = (name = "") => {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");
};

const menuItemClass = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-base-content/80 hover:bg-base-200 hover:text-base-content";

const UserMenu = () => {
    const user = useSelector((state) => state.auth.user);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { ref, close } = useDropdown();

    const handleLogout = async () => {
        close();
        await dispatch(logoutUser());
        navigate("/login");
    };

    // Just after logout the user is null for a moment, before the page changes
    if (!user) {
        return null;
    }

    return (
        <details ref={ref} className="relative">
            <summary
                className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-base-200 [&::-webkit-details-marker]:hidden"
                aria-label="Account menu"
            >
                <span className="flex size-9 items-center justify-center rounded-full bg-neutral text-xs font-semibold text-neutral-content">
                    {getInitials(user.name)}
                </span>
                <span className="hidden text-left text-sm leading-tight md:block">
                    <span className="block font-medium">{user.name}</span>
                    <span className="block text-xs text-base-content/55">{formatRole(user.role)}</span>
                </span>
                <ChevronDown size={16} className="hidden text-base-content/50 md:block" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-raised">
                <p className="truncate px-3 py-2 text-xs text-base-content/55">{user.email}</p>
                <Link to="/profile" className={menuItemClass} onClick={close}>
                    <UserRound size={16} aria-hidden="true" /> My profile
                </Link>
                <button type="button" className={`${menuItemClass} text-error hover:text-error`} onClick={handleLogout}>
                    <LogOut size={16} aria-hidden="true" /> Log out
                </button>
            </div>
        </details>
    );
};

export default UserMenu;
