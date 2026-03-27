import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { AuthPage } from "./AuthPage";

const loginMock = vi.fn();
const registerMock = vi.fn();

vi.mock("../state/auth", () => ({
  useAuth: () => ({
    user: null,
    login: loginMock,
    register: registerMock,
  }),
}));

describe("AuthPage", () => {
  beforeEach(() => {
    loginMock.mockReset();
    registerMock.mockReset();
  });

  it("enforces role-specific driver sign-in mode", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /run pickups, dropoffs/i }));

    expect(screen.getByText("Driver Portal")).toBeInTheDocument();
    expect(
      screen.getByText(/drivers are provisioned by admins/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /admin setup only/i }),
    ).toBeDisabled();
  });
});
