const { expect } = require("@playwright/test");
const { apiAs, createVia } = require("./api");

// A short value that is different on every call, to keep test data from colliding
const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

// Fills in the real login form and presses the button (does NOT wait for the result)
const submitLoginForm = async (page, { email, password }) => {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
};

// Logs in through the login page and waits until the staff app has opened
const loginViaUi = async (page, user) => {
    await submitLoginForm(page, user);
    await expect(page.getByRole("navigation", { name: "App" })).toBeVisible();
};

// Opens the account menu and presses "Log out".
// (The menu button is a <summary> element, which Playwright doesn't count as a "button", so it is found by its label.)
const logoutViaUi = async (page) => {
    await page.getByLabel("Account menu").click();
    await page.getByRole("button", { name: "Log out" }).click();
};

// Opens a page the way a person does: click its link in the sidebar.
// The group (the sidebar heading the link sits under) is only there to keep calls readable.
//   await goToNav(page, "Catalog", "Products");
//   await goToNav(page, null, "Dashboard");
const goToNav = async (page, group, link) => {
    await page.getByRole("navigation", { name: "App" }).getByRole("link", { name: link, exact: true }).click();
};

// Listing pages show one card (<article>) per record, inside <main>
const cards = (page) => page.locator("main article");
const cardOf = (page, text) => cards(page).filter({ hasText: text });

// One labelled value on a card, e.g. cardValue(card, "Available") → the <dd> next to that label
const cardValue = (card, label) => card.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");

// The "Showing 1–10 of 12 products" line under a list
const pagination = (page) => page.getByRole("navigation", { name: "Pagination" });

// The green confirmation banner with this text (e.g. "Category created."). Looked up by its text because the
// loading spinner also has role="status", so a bare getByRole("status") can match two things at once.
const flash = (page, text) => page.getByRole("status").filter({ hasText: text });

// The token cookie the browser currently holds for the app (undefined = not logged in)
const tokenCookie = async (page) => {
    const cookies = await page.context().cookies();
    return cookies.find((cookie) => cookie.name === "token");
};

// A brand-new ACTIVE user, created through the API as the admin. Returns { name, email, password, role, _id }.
const makeUser = async (overrides = {}) => {
    const id = unique();
    const user = { name: `E2E User ${id}`, email: `user-${id}@e2e.test`, password: "Temp12345", role: "STAFF", ...overrides };
    const admin = await apiAs("admin");
    const { user: created } = await createVia(admin, "users", user);
    await admin.dispose();
    return { ...user, _id: created._id };
};

module.exports = { unique, submitLoginForm, loginViaUi, logoutViaUi, goToNav, cards, cardOf, cardValue, pagination, flash, tokenCookie, makeUser };
