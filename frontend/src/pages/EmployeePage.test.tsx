import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { EmployeeDashboard } from "./EmployeePage";

const getActiveRideMock = vi.fn();
const getRideHistoryMock = vi.fn();
const cancelRideMock = vi.fn();
const refreshBriefMock = vi.fn();

const useAuthMock = vi.fn();
const useLiveStreamMock = vi.fn();
const useCopilotMock = vi.fn();

const activeRide = {
  id: "ride-1",
  status: "matched",
  pickup_address: "Electronic City, Bengaluru",
  pickup_latitude: 12.8452,
  pickup_longitude: 77.6602,
  destination_address: "Koramangala, Bengaluru",
  destination_latitude: 12.9352,
  destination_longitude: 77.6245,
  driver_name: "Ravi",
  van_license_plate: "KA01VP1234",
  estimated_wait_minutes: 6,
};

vi.mock("../lib/api", () => ({
  api: {
    getActiveRide: (...args: unknown[]) => getActiveRideMock(...args),
    getRideHistory: (...args: unknown[]) => getRideHistoryMock(...args),
    cancelRide: (...args: unknown[]) => cancelRideMock(...args),
    previewRoute: vi.fn(),
    geocodeAddress: vi.fn(),
    requestRide: vi.fn(),
  },
}));

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
  InfoRow: ({ label, value }: { label: string; value: string }) => (
    <div>
      {label}
      :
      {value}
    </div>
  ),
  LiveEventsPanel: () => <div>Live events</div>,
  LiveStatusBadge: ({ state }: { state: string }) => <span>{state}</span>,
  RideTable: () => <div>Ride history</div>,
}));

describe("EmployeeDashboard", () => {
  beforeEach(() => {
    getActiveRideMock.mockReset();
    getRideHistoryMock.mockReset();
    cancelRideMock.mockReset();
    refreshBriefMock.mockReset();

    useAuthMock.mockReturnValue({
      token: "employee-token",
      user: {
        id: "employee-1",
        role: "employee",
        name: "Ananya",
        company_name: "Van Pooling",
      },
      logout: vi.fn(),
    });

    useLiveStreamMock.mockReturnValue({
      snapshot: {
        data: {
          active_ride: activeRide,
          ride_history: [activeRide],
          notifications: [],
          notifications_unread_count: 0,
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
      refreshBrief: refreshBriefMock,
      askCopilot: vi.fn(),
    });

    getActiveRideMock.mockResolvedValue(activeRide);
    getRideHistoryMock.mockResolvedValue([activeRide]);
    cancelRideMock.mockResolvedValue({ ...activeRide, status: "cancelled_by_employee" });
    refreshBriefMock.mockResolvedValue(undefined);
  });

  it("allows rider cancellation before pickup and calls the API", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <EmployeeDashboard />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /cancel before pickup/i }));

    await waitFor(() => {
      expect(cancelRideMock).toHaveBeenCalledWith("employee-token", "ride-1");
    });
    expect(await screen.findByText(/Ride cancelled before pickup and capacity released/i)).toBeInTheDocument();
  });
});
