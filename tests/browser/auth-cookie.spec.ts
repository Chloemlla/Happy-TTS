import { expect, test } from "@playwright/test";

test("HttpOnly auth cookie survives navigation and clears on logout", async ({ page, context }) => {
  await page.goto("/session");
  await page.evaluate(async () => {
    await fetch("/session", { method: "POST", credentials: "include" });
  });

  const cookies = await context.cookies();
  const authCookie = cookies.find((cookie) => cookie.name === "synapse_token");
  expect(authCookie).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  });

  const authenticated = await page.evaluate(async () => {
    const response = await fetch("/session", { credentials: "include" });
    return response.json();
  });
  expect(authenticated).toEqual({ authenticated: true });
  expect(await page.evaluate(() => document.cookie)).not.toContain("synapse_token");

  await page.reload();
  await expect(page.locator("body")).toContainText("authenticated");

  await page.evaluate(async () => {
    await fetch("/session", { method: "DELETE", credentials: "include" });
  });
  expect((await context.cookies()).some((cookie) => cookie.name === "synapse_token")).toBe(false);
});
