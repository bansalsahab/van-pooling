import { AppLayout } from "../../components/Layout";
import { useLiveStream } from "../../hooks/useLiveStream";
import type { EmployeeLiveSnapshot } from "../../lib/types";
import { useAuth } from "../../state/auth";

export function EmployeePassesPage() {
  const { token } = useAuth();
  const { snapshot } = useLiveStream<EmployeeLiveSnapshot>(token);

  return (
    <AppLayout
      notificationUnreadCount={snapshot?.data.notifications_unread_count ?? 0}
      title="Passes and Wallet"
      subtitle="Track commuter pass and mobility wallet balances."
    >
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Wallet</p>
            <h3>Commuter pass ledger</h3>
          </div>
        </div>
        <p>
          Pass balances and transaction history are being connected to the tenant billing ledger in
          the next implementation stage.
        </p>
      </section>
    </AppLayout>
  );
}
