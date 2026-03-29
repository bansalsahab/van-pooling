import { AppLayout } from "../../components/Layout";
import { useLiveStream } from "../../hooks/useLiveStream";
import type { DriverLiveSnapshot } from "../../lib/types";
import { useAuth } from "../../state/auth";

export function DriverSchedulePage() {
  const { token } = useAuth();
  const { snapshot } = useLiveStream<DriverLiveSnapshot>(token);

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      title="Shift Schedule"
      subtitle="View weekly assignments and formal shift windows."
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Shifts</p>
            <h3>Timesheet rollout</h3>
          </div>
        </div>
        <p>
          Shift assignment and clock in/out timesheet capture is being added in the next backend
          implementation stage.
        </p>
      </section>
    </AppLayout>
  );
}
