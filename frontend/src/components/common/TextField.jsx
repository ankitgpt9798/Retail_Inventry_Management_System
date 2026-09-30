// One labelled input + its error message.
// Used with React Hook Form:  <TextField label="Email" error={errors.email} {...register("email")} />
// "...register('email')" gives the input its name, onChange, onBlur and ref,
// so React Hook Form can read the value and validate it.
const TextField = ({ label, error, hint, id, type = "text", className = "", ...inputProps }) => {
    const inputId = id || inputProps.name;

    return (
        <div className={className}>
            <label className="field-label" htmlFor={inputId}>
                {label}
            </label>
            <input
                id={inputId}
                type={type}
                className={`input ${error ? "input-error" : ""}`}
                aria-invalid={error ? "true" : "false"}
                {...inputProps}
            />
            {error ? <p className="field-error">{error.message}</p> : hint && <p className="field-hint">{hint}</p>}
        </div>
    );
};

export default TextField;
