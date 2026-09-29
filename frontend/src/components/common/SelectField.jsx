// Same look as TextField, but a drop-down. Children are the <option>s.
const SelectField = ({ label, error, hint, id, children, ...selectProps }) => {
    const selectId = id || selectProps.name;

    return (
        <fieldset className="fieldset">
            <label className="fieldset-legend" htmlFor={selectId}>
                {label}
            </label>
            <select
                id={selectId}
                className={`select w-full ${error ? "select-error" : ""}`}
                aria-invalid={error ? "true" : "false"}
                {...selectProps}
            >
                {children}
            </select>
            {error ? <p className="label text-error">{error.message}</p> : hint && <p className="label">{hint}</p>}
        </fieldset>
    );
};

export default SelectField;
