import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { AdminDashboard } from "./AdminPage";

const logoutMock = vi.fn();
const useAuthMock = vi.fn();
const useLiveStreamMock = vi.fn();
const useCopilotMock = vi.fn();

vi.mock("../state/auth", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("../hooks/useLiveStream", () => ({
  useLiveStream: (...args: unknown[]) => useLiveStreamMock(...args),
}));

vi.mock("../hooks/useCopilot", () => ({
  useCopilot: () => useCopilotMock(),
}));

vi.mock("../components/LiveMap", () => ({
  LiveMap: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../components/CopilotPanel", () => ({
  CopilotPanel: () => <div>Copilot</div>,
}));

vi.mock("../components/common", () => ({
  AIInsightsPanel: () => <div>Insights</div>,
  LiveEventsPanel: () => <div>Live events</div>,
  LiveStatusBadge: ({ state }: { state: string }) => <span>{state}</span>,
  MetricPanel: ({
    label,
    value,
    detail,
    onClick,
  }: {
    label: string;
    value: string;
    detail: string;
    onClick?: () => void;
  }) => (
    <button onClick={onClick} type="button">
      {label}
      {" "}
      {value}
      {" "}
      {detail}
    </button>
  ),
}));

describe("AdminDashboard", () => {
  beforeEach(() => {
    logoutMock.mockReset();
    useAuthMock.mockReturnValue({
      token: null,
      user: {
        id: "admin-1",
        name: "Ops Admin",
        role: "admin",
        company_name: "Van Pooling",
      },
      logout: logoutMock,
    });
    useLiveStreamMock.mockReturnValue({
      snapshot: {
        data: {
          dashboard: {
            employees_count: 4,
            available_vans: 2,
            total_vans: 3,
            pending_requests: 1,
            open_alerts: 1,
          },
          vans: [],
          employees: [],
          drivers: [],
          trips: [],
          pending_requests: [],
          alerts: [
            {
              id: "alert-1",
              severity: "high",
              title: "Ride Dispatch Failed",
              message: "No eligible van became available within the dispatch window.",
              created_at: "2026-03-27T08:00:00Z",
            },
          ],
          notifications: [],
          notifications_unread_count: 1,
        },
        insights: [],
      },
      connectionState: "live",
      lastMessageAt: null,
      streamError: null,
      recentEvents: [],
    });
    useCopilotMock.mockReturnValue({
      brief: null,
      reply: null,
      loading: false,
      asking: false,
      error: null,
      refreshBrief: vi.fn(),
      askCopilot: vi.fn(),
    });
  });

  it("renders operational alerts from live snapshot data", () => {
    render(
      <MemoryRouter>
        <AdminDashboard section="overview" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Ride Dispatch Failed")).toBeInTheDocument();
    expect(
      screen.getByText(/No eligible van became available within the dispatch window/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resolve/i })).toBeInTheDocument();
  });
});
