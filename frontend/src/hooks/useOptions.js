import { useEffect, useState } from "react";
import fetchAllPages from "../services/fetchAllPages";

// Loads the choices for a drop-down once (e.g. all active products, all warehouses).
//   path:    "/products"
//   listKey: "products"  (the array inside response.data.data)
//   params:  extra filters, e.g. { status: "ACTIVE" }
//   enabled: false = don't ask at all (e.g. the role isn't allowed to see this list)
// The API sends at most 100 items per request, so ALL the pages are loaded (see fetchAllPages);
// otherwise the 101st product could never be chosen in a form.
// If loading fails the list is simply empty; the page itself still works.
const useOptions = (path, listKey, params = {}, enabled = true) => {
    const [options, setOptions] = useState([]);
    const paramsKey = JSON.stringify(params);

    useEffect(() => {
        if (!enabled) return undefined;

        let ignore = false;
        fetchAllPages(path, listKey, JSON.parse(paramsKey))
            .then((items) => {
                if (!ignore) setOptions(items);
            })
            .catch(() => {
                if (!ignore) setOptions([]);
            });
        // If the page closes before the answer arrives, don't update it
        return () => {
            ignore = true;
        };
    }, [path, listKey, paramsKey, enabled]);

    return options;
};

export default useOptions;
