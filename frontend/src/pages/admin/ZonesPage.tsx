import { AppLayout } from "../../components/Layout";
import { useLiveStream } from "../../hooks/useLiveStream";
import type { AdminLiveSnapshot } from "../../lib/types";
import { useAuth } from "../../state/auth";

export function AdminZonesPage() {
  const { token, user } = useAuth();
  const { snapshot } = useLiveStream<AdminLiveSnapshot>(token);

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      pendingRequestCount={snapshot?.data.pending_requests.length ?? 0}
      title="Service Zones"
      subtitle={`Define and manage pickup and destination service boundaries for ${user?.company_name || "your company"}.`}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Zones</p>
            <h3>Geofence management</h3>
          </div>
        </div>
        <p>
          Polygon zone drawing and editing is the next build slice and will be linked with policy
          checks in matching.
        </p>
      </section>
    </AppLayout>
  );
}
