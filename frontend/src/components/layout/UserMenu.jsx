import { LogOut, UserRound } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { logoutUser } from "../../store/authSlice";
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

const UserMenu = () => {
    const user = useSelector((state) => state.auth.user);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await dispatch(logoutUser());
        navigate("/login");
    };

    // Just after logout the user is null for a moment, before the page changes
    if (!user) {
        return null;
    }

    return (
        <details className="dropdown dropdown-end">
            <summary className="btn btn-ghost gap-2 px-2 list-none" aria-label="Account menu">
                <div className="avatar avatar-placeholder">
                    <div className="w-8 rounded-full bg-neutral text-neutral-content">
                        <span className="text-xs">{getInitials(user.name)}</span>
                    </div>
                </div>
                <span className="hidden text-left text-sm leading-tight lg:block">
                    <span className="block font-medium">{user.name}</span>
                    <span className="block text-xs text-base-content/60">{formatRole(user.role)}</span>
                </span>
            </summary>
            <ul className="dropdown-content menu z-40 mt-2 w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg">
                <li className="menu-title">
                    <span>{user.email}</span>
                </li>
                <li>
                    <Link to="/profile">
                        <UserRound size={16} aria-hidden="true" /> My profile
                    </Link>
                </li>
                <li>
                    <button type="button" onClick={handleLogout}>
                        <LogOut size={16} aria-hidden="true" /> Log out
                    </button>
                </li>
            </ul>
        </details>
    );
};

export default UserMenu;
