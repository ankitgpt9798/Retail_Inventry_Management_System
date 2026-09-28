// Date helpers for reports.
//
// MongoDB stores every date in UTC. The business runs in India (UTC+05:30), so an
// order placed at 01:30 on 1 October (India) is stored as 20:00 on 30 September (UTC).
// Reports must count it in OCTOBER, so every day/month calculation here uses the
// business's offset instead of UTC.
//
// Report dates are plain "YYYY-MM-DD" strings in the business's time zone.

const REPORT_UTC_OFFSET = process.env.REPORT_UTC_OFFSET || "+05:30";

// "+05:30" → 330, "-04:00" → -240
const offsetToMinutes = (offset) => {
    const sign = offset.startsWith("-") ? -1 : 1;
    const [hours, minutes] = offset.slice(1).split(":").map(Number);
    return sign * (hours * 60 + minutes);
};

const padMonth = (month) => String(month).padStart(2, "0");

// Today's date in the business's time zone, e.g. "2026-09-28"
const todayInReportZone = (now = new Date()) => {
    const shifted = new Date(now.getTime() + offsetToMinutes(REPORT_UTC_OFFSET) * 60 * 1000);
    return shifted.toISOString().slice(0, 10);
};

// "2026-09-01" → the exact moment that day starts in the business's time zone
const startOfDay = (dateString) => new Date(`${dateString}T00:00:00.000${REPORT_UTC_OFFSET}`);

// "2026-09-30" → the last millisecond of that day, so "to" includes the whole day
const endOfDay = (dateString) => new Date(`${dateString}T23:59:59.999${REPORT_UTC_OFFSET}`);

// Every month between two dates, inclusive: ("2026-11-15", "2027-02-01") → ["2026-11", "2026-12", "2027-01", "2027-02"]
// Counted with plain numbers, so no time-zone surprises.
const monthKeysBetween = (fromDate, toDate) => {
    let [year, month] = fromDate.split("-").map(Number);
    const [toYear, toMonth] = toDate.split("-").map(Number);

    const keys = [];
    while (year < toYear || (year === toYear && month <= toMonth)) {
        keys.push(`${year}-${padMonth(month)}`);
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
    }
    return keys;
};

// Default range: the first day of the month (months - 1) months ago, up to today.
// e.g. 6 months on 2026-09-28 → 2026-04-01 … 2026-09-28
const defaultRange = (months = 6, now = new Date()) => {
    const to = todayInReportZone(now);
    let [year, month] = to.split("-").map(Number);
    month -= months - 1;
    while (month < 1) {
        month += 12;
        year -= 1;
    }
    return { from: `${year}-${padMonth(month)}-01`, to };
};

// Turns optional from/to strings into everything a report needs
const resolveRange = ({ from, to } = {}, defaultMonths = 6) => {
    const defaults = defaultRange(defaultMonths);
    const fromDate = from || defaults.from;
    const toDate = to || defaults.to;

    return {
        from: fromDate,
        to: toDate,
        start: startOfDay(fromDate),
        end: endOfDay(toDate),
        months: monthKeysBetween(fromDate, toDate)
    };
};

module.exports = {
    REPORT_UTC_OFFSET,
    offsetToMinutes,
    todayInReportZone,
    startOfDay,
    endOfDay,
    monthKeysBetween,
    defaultRange,
    resolveRange
};
