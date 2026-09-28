// One labelled input + its error message.
// Used with React Hook Form:  <TextField label="Email" error={errors.email} {...register("email")} />
// "...register('email')" gives the input its name, onChange, onBlur and ref,
// so React Hook Form can read the value and validate it.
const TextField = ({ label, error, hint, id, type = "text", ...inputProps }) => {
    const inputId = id || inputProps.name;

    return (
        <fieldset className="fieldset">
            <label className="fieldset-legend" htmlFor={inputId}>
                {label}
            </label>
            <input
                id={inputId}
                type={type}
                className={`input w-full ${error ? "input-error" : ""}`}
                aria-invalid={error ? "true" : "false"}
                {...inputProps}
            />
            {error ? (
                <p className="label text-error">{error.message}</p>
            ) : (
                hint && <p className="label">{hint}</p>
            )}
        </fieldset>
    );
};

export default TextField;
