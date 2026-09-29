import { useEffect, useState } from "react";
import api from "../services/api";

// Loads the choices for a drop-down once (e.g. all active products, all warehouses).
//   path:    "/products"
//   listKey: "products"  (the array inside response.data.data)
//   params:  extra filters, e.g. { status: "ACTIVE" }
// The API allows at most 100 items per request, so that is the most a drop-down shows.
// If loading fails the list is simply empty; the page itself still works.
const useOptions = (path, listKey, params = {}) => {
    const [options, setOptions] = useState([]);
    const paramsKey = JSON.stringify(params);

    useEffect(() => {
        let ignore = false;
        api.get(path, { params: { ...JSON.parse(paramsKey), limit: 100 } })
            .then((response) => {
                if (!ignore) setOptions(response.data.data[listKey]);
            })
            .catch(() => {
                if (!ignore) setOptions([]);
            });
        // If the page closes before the answer arrives, don't update it
        return () => {
            ignore = true;
        };
    }, [path, listKey, paramsKey]);

    return options;
};

export default useOptions;
