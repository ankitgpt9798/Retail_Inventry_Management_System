// Formatting helpers so numbers and dates look the same on every page (Indian format)

// 1234567 → "12,34,567"
export const formatNumber = (value) => {
    return new Intl.NumberFormat("en-IN").format(value ?? 0);
};

// 120472.1 → "₹1,20,472.10"
export const formatCurrency = (value) => {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value ?? 0);
};

// ISO date → "28 Sept 2026, 5:42 pm" (in the viewer's own time zone)
export const formatDateTime = (value) => {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

// "Good morning" / "Good afternoon" / "Good evening"
export const greeting = (date = new Date()) => {
    const hour = date.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
};
