import { AppLayout } from "../../components/Layout";
import { useAuth } from "../../state/auth";

function roleGuidance(role?: string | null) {
  if (role === "employee") {
    return "Use this page to find commute policy contacts, lost-and-found support, and ride issue escalation.";
  }
  if (role === "driver") {
    return "Use this page to find dispatch support, incident handling guidance, and shift issue escalation.";
  }
  if (role === "admin") {
    return "Use this page to access operational runbooks, incident escalation flow, and tenant support channels.";
  }
  return "Use this page to access product support and operations contacts.";
}

export function HelpPage() {
  const { user } = useAuth();

  return (
    <AppLayout
      title="Help and Support"
      subtitle={roleGuidance(user?.role)}
    >
      <div className="content-grid two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Support</p>
              <h3>Operations help desk</h3>
            </div>
          </div>
          <div className="stack compact">
            <p>
              For dispatch issues, trip delays, or ride interruptions, contact fleet operations
              through your company support channel.
            </p>
            <p>
              Include ride or trip IDs from the app when reporting an issue so support can respond
              faster.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Policy</p>
              <h3>Commute and safety guidance</h3>
            </div>
          </div>
          <div className="stack compact">
            <p>
              Review pickup windows, cancellation cutoffs, and service-zone guidelines before
              requesting or dispatching rides.
            </p>
            <p>
              If a personal item is lost in a vehicle, create a support ticket with trip timestamp
              and van plate details.
            </p>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
