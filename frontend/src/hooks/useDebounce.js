import { useEffect, useState } from "react";

// Returns `value` only after it has stopped changing for `delay` ms.
// Used for search boxes so we call the API once after typing stops,
// not on every keystroke.
const useDebounce = (value, delay = 400) => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debounced;
};

export default useDebounce;
