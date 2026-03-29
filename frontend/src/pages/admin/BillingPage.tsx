import { AppLayout } from "../../components/Layout";
import { useLiveStream } from "../../hooks/useLiveStream";
import type { AdminLiveSnapshot } from "../../lib/types";
import { useAuth } from "../../state/auth";

export function AdminBillingPage() {
  const { token, user } = useAuth();
  const { snapshot } = useLiveStream<AdminLiveSnapshot>(token);

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      pendingRequestCount={snapshot?.data.pending_requests.length ?? 0}
      title="Tenant Billing"
      subtitle={`Billing and usage controls for ${user?.company_name || "your company"}.`}
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Billing</p>
            <h3>Internal ledger rollout</h3>
          </div>
        </div>
        <p>
          Invoice, usage, and commuter pass ledger flows are being wired in this section as the
          next backend stage.
        </p>
      </section>
    </AppLayout>
  );
}
