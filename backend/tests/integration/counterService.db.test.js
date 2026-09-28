const { getNextCode } = require("../../src/services/counterService");
const { connectTestDB, clearTestDB, closeTestDB } = require("../helpers/testDb");

beforeAll(async () => {
    await connectTestDB();
}, 20000);

beforeEach(async () => {
    await clearTestDB();
});

afterAll(async () => {
    await closeTestDB();
});

describe("getNextCode", () => {
    test("starts at 000001 and counts up, with zero padding", async () => {
        expect(await getNextCode("transfer", "TRF")).toBe("TRF-000001");
        expect(await getNextCode("transfer", "TRF")).toBe("TRF-000002");
    });

    test("each sequence counts separately", async () => {
        await getNextCode("transfer", "TRF");
        await getNextCode("transfer", "TRF");

        expect(await getNextCode("order", "ORD")).toBe("ORD-000001");
    });

    test("20 codes requested at the same moment are all different", async () => {
        const codes = await Promise.all(Array.from({ length: 20 }, () => getNextCode("transfer", "TRF")));

        expect(new Set(codes).size).toBe(20);
        expect(codes.sort()[19]).toBe("TRF-000020");
    });
});
