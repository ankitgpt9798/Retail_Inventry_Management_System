// A centred spinner with an optional text, e.g. <Loader text="Loading dashboard…" />
const Loader = ({ text = "Loading…", fullPage = false }) => {
    return (
        <div
            className={`flex flex-col items-center justify-center gap-3 text-sm text-base-content/60 ${fullPage ? "min-h-screen" : "py-16"}`}
            role="status"
        >
            <span className="spinner size-7 text-primary" aria-hidden="true"></span>
            <span>{text}</span>
        </div>
    );
};

export default Loader;
