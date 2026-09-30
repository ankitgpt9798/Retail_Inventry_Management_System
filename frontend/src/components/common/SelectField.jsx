// Same look as TextField, but a drop-down. Children are the <option>s.
const SelectField = ({ label, error, hint, id, className = "", children, ...selectProps }) => {
    const selectId = id || selectProps.name;

    return (
        <div className={className}>
            <label className="field-label" htmlFor={selectId}>
                {label}
            </label>
            <select
                id={selectId}
                className={`select ${error ? "select-error" : ""}`}
                aria-invalid={error ? "true" : "false"}
                {...selectProps}
            >
                {children}
            </select>
            {error ? <p className="field-error">{error.message}</p> : hint && <p className="field-hint">{hint}</p>}
        </div>
    );
};

export default SelectField;
