import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinuxDoAuthCallbackPage } from "./LinuxDoAuthCallbackPage";

const navigate = vi.fn();
const loginWithToken = vi.fn();
const setNotification = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("react-router-dom", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
  useSearchParams: () => [currentSearchParams],
}));

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    loginWithToken,
  }),
}));

vi.mock("./Notification", () => ({
  useNotification: () => ({
    setNotification,
  }),
}));

describe("LinuxDoAuthCallbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearchParams = new URLSearchParams();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("exchanges the login ticket from the callback URL", async () => {
    currentSearchParams = new URLSearchParams("ticket=relay-ticket");

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "jwt-token",
          user: { id: "1", username: "linuxdo_user" },
          isNewUser: false,
        }),
      } as Response);

    render(<LinuxDoAuthCallbackPage />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/auth/linuxdo/exchange",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticket: "relay-ticket" }),
      }),
    );
    await waitFor(() =>
      expect(loginWithToken).toHaveBeenCalledWith("jwt-token", {
        id: "1",
        username: "linuxdo_user",
      }),
    );
  });
});
