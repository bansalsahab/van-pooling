import { AppLayout } from "../../components/Layout";
import { useLiveStream } from "../../hooks/useLiveStream";
import type { DriverLiveSnapshot } from "../../lib/types";
import { useAuth } from "../../state/auth";

export function DriverVehicleChecksPage() {
  const { token } = useAuth();
  const { snapshot } = useLiveStream<DriverLiveSnapshot>(token);

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      title="Vehicle Checks"
      subtitle="Run mandatory pre-shift maintenance and safety checks."
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Inspections</p>
            <h3>Daily checklists</h3>
          </div>
        </div>
        <p>
          Digital inspection checklist capture is being connected to shift start validation in the
          next implementation stage.
        </p>
      </section>
    </AppLayout>
  );
}
