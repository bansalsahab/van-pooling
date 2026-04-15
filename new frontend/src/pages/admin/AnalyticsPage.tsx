import { AppLayout } from "../../components/Layout";
import { useLiveStream } from "../../hooks/useLiveStream";
import type { AdminLiveSnapshot } from "../../lib/types";
import { useAuth } from "../../state/auth";

export function AdminAnalyticsPage() {
  const { token, user } = useAuth();
  const { snapshot } = useLiveStream<AdminLiveSnapshot>(token);

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      pendingRequestCount={snapshot?.data.pending_requests.length ?? 0}
      title="Analytics and Insights"
      subtitle={`Historical reporting workspace for ${user?.company_name || "your company"}.`}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Analytics</p>
            <h3>Reporting foundation</h3>
          </div>
        </div>
        <p>
          KPI trend and ROI reporting screens are being moved here from the operations dashboard
          as part of the nested-route refactor.
        </p>
      </section>
    </AppLayout>
  );
}
