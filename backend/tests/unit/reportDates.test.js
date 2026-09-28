const {
    offsetToMinutes,
    todayInReportZone,
    startOfDay,
    endOfDay,
    monthKeysBetween,
    defaultRange,
    resolveRange
} = require("../../src/utils/reportDates");

// These tests assume the default offset (+05:30, India)

describe("offsetToMinutes", () => {
    test("positive and negative offsets", () => {
        expect(offsetToMinutes("+05:30")).toBe(330);
        expect(offsetToMinutes("-04:00")).toBe(-240);
    });
});

describe("day boundaries in +05:30", () => {
    test("a day starts at 18:30 UTC the evening before", () => {
        expect(startOfDay("2026-10-01").toISOString()).toBe("2026-09-30T18:30:00.000Z");
    });

    test("'to' includes the whole day", () => {
        expect(endOfDay("2026-09-30").toISOString()).toBe("2026-09-30T18:29:59.999Z");
    });

    test("20:00 UTC on 30 Sep is already 1 Oct in India", () => {
        expect(todayInReportZone(new Date("2026-09-30T20:00:00Z"))).toBe("2026-10-01");
    });
});

describe("monthKeysBetween", () => {
    test("inclusive, across a year boundary", () => {
        expect(monthKeysBetween("2026-11-15", "2027-02-01")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    });

    test("same month → one key", () => {
        expect(monthKeysBetween("2026-09-01", "2026-09-30")).toEqual(["2026-09"]);
    });
});

describe("defaultRange / resolveRange", () => {
    test("6 months back to the 1st, crossing a year", () => {
        expect(defaultRange(6, new Date("2026-03-10T06:00:00Z"))).toEqual({ from: "2025-10-01", to: "2026-03-10" });
    });

    test("explicit from/to are kept and turned into start/end moments + months", () => {
        const range = resolveRange({ from: "2026-08-01", to: "2026-09-30" });

        expect(range).toMatchObject({ from: "2026-08-01", to: "2026-09-30", months: ["2026-08", "2026-09"] });
        expect(range.start.toISOString()).toBe("2026-07-31T18:30:00.000Z");
    });
});
