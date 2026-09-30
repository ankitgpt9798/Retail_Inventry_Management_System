import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// For drop-down menus built on the HTML <details> element (it opens/closes itself on click).
// This hook adds what <details> can't do alone: close on a click outside it, on Escape,
// and after moving to another page.
//   const { ref, close } = useDropdown();
//   <details ref={ref}> <summary>…</summary> <div>menu</div> </details>
const useDropdown = () => {
    const ref = useRef(null);
    const { pathname } = useLocation();

    const close = useCallback(() => {
        if (ref.current) ref.current.open = false;
    }, []);

    // A new page → close
    useEffect(() => {
        close();
    }, [pathname, close]);

    useEffect(() => {
        const closeOnOutsideClick = (event) => {
            if (ref.current?.open && !ref.current.contains(event.target)) close();
        };
        const closeOnEscape = (event) => {
            if (event.key === "Escape") close();
        };
        document.addEventListener("mousedown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [close]);

    return { ref, close };
};

export default useDropdown;
