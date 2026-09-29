// One headline number with its label, e.g. "Units on hand · 1,917"
const StatTile = ({ label, value, testId }) => {
    return (
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
            <p className="text-sm text-base-content/70">{label}</p>
            <p className="mt-1 text-2xl font-bold" data-testid={testId}>
                {value}
            </p>
        </div>
    );
};

export default StatTile;
