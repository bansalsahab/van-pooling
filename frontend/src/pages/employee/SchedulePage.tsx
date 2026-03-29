import { AppLayout } from "../../components/Layout";
import { useLiveStream } from "../../hooks/useLiveStream";
import type { EmployeeLiveSnapshot } from "../../lib/types";
import { useAuth } from "../../state/auth";

export function EmployeeSchedulePage() {
  const { token } = useAuth();
  const { snapshot } = useLiveStream<EmployeeLiveSnapshot>(token);

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      title="Recurring Rides"
      subtitle="Set weekday commute templates for automatic ride booking."
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Schedule</p>
            <h3>Weekday templates</h3>
          </div>
        </div>
        <p>
          Recurring ride templates are being connected to the dispatch worker so weekday schedules
          can generate ride requests automatically.
        </p>
      </section>
    </AppLayout>
  );
}
