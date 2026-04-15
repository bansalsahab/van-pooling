import { useEffect, useMemo, useState } from "react";

import { AppLayout } from "../../components/Layout";
import { DataTable, type DataTableColumn } from "../../components/ui/DataTable";
import { EntityForm } from "../../components/ui/EntityForm";
import { useLiveStream } from "../../hooks/useLiveStream";
import { api } from "../../lib/api";
import type {
  AdminLiveSnapshot,
  AdminScope,
  UserProfile,
  UserRole,
} from "../../lib/types";
import { useAuth } from "../../state/auth";

const DEFAULT_ADMIN_SCOPE: AdminScope = "supervisor";

interface UserDraft {
  role: UserRole;
  status: "active" | "inactive" | "suspended";
  admin_scope: AdminScope;
}

export function AdminUsersPage() {
  const { token, user } = useAuth();
  const { snapshot } = useLiveStream<AdminLiveSnapshot>(token);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [draftByUser, setDraftByUser] = useState<Record<string, UserDraft>>({});
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "employee" as UserRole,
    admin_scope: DEFAULT_ADMIN_SCOPE,
  });
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const permissionSet = useMemo(
    () => new Set(user?.admin_permissions || []),
    [user?.admin_permissions],
  );
  const canManageUsers = permissionSet.has("users:manage");
  const unread = snapshot?.data.notifications_unread_count ?? 0;
  const pendingRequests = snapshot?.data.pending_requests.length ?? 0;

  useEffect(() => {
    if (!token) return;
    void refreshUsers();
  }, [token]);

  async function refreshUsers() {
    if (!token) return;
    setLoading(true);
    try {
      const directory = await api.getAdminUsers(token);
      setUsers(directory);
      setDraftByUser((current) => {
        const next = { ...current };
        for (const item of directory) {
          next[item.id] = next[item.id] || {
            role: item.role,
            status: (item.status as "active" | "inactive" | "suspended") || "active",
            admin_scope:
              (item.admin_scope as "supervisor" | "dispatcher" | "viewer" | "support") ||
              DEFAULT_ADMIN_SCOPE,
          };
        }
        return next;
      });
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !canManageUsers) return;
    setCreateBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.createAdminUser(token, {
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        phone: createForm.phone.trim() || undefined,
        role: createForm.role,
        admin_scope: createForm.role === "admin" ? createForm.admin_scope : undefined,
      });
      setCreateForm({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "employee",
        admin_scope: DEFAULT_ADMIN_SCOPE,
      });
      setMessage("User created.");
      await refreshUsers();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create user.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleSaveUser(userId: string) {
    if (!token || !canManageUsers) return;
    const draft = draftByUser[userId];
    if (!draft) return;
    setSavingUserId(userId);
    setMessage(null);
    setError(null);
    try {
      const updated = await api.updateAdminUser(token, userId, {
        role: draft.role,
        status: draft.status,
        admin_scope: draft.role === "admin" ? draft.admin_scope : undefined,
      });
      setUsers((current) =>
        current.map((item) => (item.id === userId ? { ...item, ...updated } : item)),
      );
      setMessage("User updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update user.");
    } finally {
      setSavingUserId(null);
    }
  }

  async function handleResetPassword(userId: string) {
    if (!token || !canManageUsers) return;
    setResettingUserId(userId);
    setMessage(null);
    setError(null);
    try {
      const response = await api.resetAdminUserPassword(token, userId);
      setTempPasswords((current) => ({
        ...current,
        [userId]: response.temporary_password,
      }));
      setMessage("Temporary password issued.");
      await refreshUsers();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Could not reset password.");
    } finally {
      setResettingUserId(null);
    }
  }

  const columns: Array<DataTableColumn<UserProfile>> = [
    {
      key: "user",
      header: "User",
      render: (item) => (
        <div className="stack compact">
          <strong>{item.name}</strong>
          <span className="muted-copy">{item.email}</span>
          {item.phone && <span className="muted-copy">{item.phone}</span>}
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (item) => {
        const draft = draftByUser[item.id];
        return canManageUsers ? (
          <select
            value={draft?.role || item.role}
            onChange={(event) =>
              setDraftByUser((current) => ({
                ...current,
                [item.id]: {
                  ...(current[item.id] || {
                    role: item.role,
                    status: (item.status as "active" | "inactive" | "suspended") || "active",
                    admin_scope:
                      (item.admin_scope as
                        | "supervisor"
                        | "dispatcher"
                        | "viewer"
                        | "support") || DEFAULT_ADMIN_SCOPE,
                  }),
                  role: event.target.value as UserRole,
                },
              }))
            }
          >
            <option value="employee">employee</option>
            <option value="driver">driver</option>
            <option value="admin">admin</option>
          </select>
        ) : (
          <span>{item.role}</span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (item) => {
        const draft = draftByUser[item.id];
        return canManageUsers ? (
          <select
            value={draft?.status || item.status}
            onChange={(event) =>
              setDraftByUser((current) => ({
                ...current,
                [item.id]: {
                  ...(current[item.id] || {
                    role: item.role,
                    status: (item.status as "active" | "inactive" | "suspended") || "active",
                    admin_scope:
                      (item.admin_scope as
                        | "supervisor"
                        | "dispatcher"
                        | "viewer"
                        | "support") || DEFAULT_ADMIN_SCOPE,
                  }),
                  status: event.target.value as "active" | "inactive" | "suspended",
                },
              }))
            }
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
            <option value="suspended">suspended</option>
          </select>
        ) : (
          <span>{item.status}</span>
        );
      },
    },
    {
      key: "scope",
      header: "Admin scope",
      render: (item) => {
        const draft = draftByUser[item.id];
        const role = draft?.role || item.role;
        if (role !== "admin") {
          return <span className="muted-copy">n/a</span>;
        }
        return canManageUsers ? (
          <select
            value={draft?.admin_scope || item.admin_scope || DEFAULT_ADMIN_SCOPE}
            onChange={(event) =>
              setDraftByUser((current) => ({
                ...current,
                [item.id]: {
                  ...(current[item.id] || {
                    role: item.role,
                    status: (item.status as "active" | "inactive" | "suspended") || "active",
                    admin_scope:
                      (item.admin_scope as
                        | "supervisor"
                        | "dispatcher"
                        | "viewer"
                        | "support") || DEFAULT_ADMIN_SCOPE,
                  }),
                  admin_scope: event.target.value as
                    | "supervisor"
                    | "dispatcher"
                    | "viewer"
                    | "support",
                },
              }))
            }
          >
            <option value="supervisor">supervisor</option>
            <option value="dispatcher">dispatcher</option>
            <option value="viewer">viewer</option>
            <option value="support">support</option>
          </select>
        ) : (
          <span>{item.admin_scope || "supervisor"}</span>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => (
        <div className="table-inline-actions">
          <button
            className="secondary-button"
            disabled={!canManageUsers || savingUserId === item.id}
            onClick={() => void handleSaveUser(item.id)}
            type="button"
          >
            {savingUserId === item.id ? "Saving..." : "Save"}
          </button>
          <button
            className="ghost-button"
            disabled={!canManageUsers || resettingUserId === item.id}
            onClick={() => void handleResetPassword(item.id)}
            type="button"
          >
            {resettingUserId === item.id ? "Resetting..." : "Temp password"}
          </button>
          {tempPasswords[item.id] && (
            <span className="status-pill">Temp: {tempPasswords[item.id]}</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout
      notificationUnreadCount={unread}
      pendingRequestCount={pendingRequests}
      title="User Directory"
      subtitle={`Manage identities and account access for ${user?.company_name || "your workspace"}.`}
    >
      {(message || error) && (
        <div className="stack compact">
          {message && <div className="success-banner">{message}</div>}
          {error && <div className="error-banner">{error}</div>}
        </div>
      )}

      <div className="content-grid two-column">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Directory</p>
              <h3>Users</h3>
            </div>
            <button className="secondary-button" onClick={() => void refreshUsers()} type="button">
              Refresh
            </button>
          </div>
          {loading ? (
            <p className="muted-copy">Loading users...</p>
          ) : (
            <DataTable
              columns={columns}
              emptyMessage="No users found for this tenant."
              rows={users}
            />
          )}
        </section>

        <EntityForm
          title="Onboard user"
          description="Create an employee, driver, or admin account for this company."
          onSubmit={handleCreateUser}
          submitLabel="Create user"
          submittingLabel="Creating..."
          busy={createBusy}
          disabled={!canManageUsers}
        >
          {!canManageUsers && (
            <div className="error-banner">Your admin scope cannot create or update users.</div>
          )}
          <label>
            Name
            <input
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Work email
            <input
              type="email"
              value={createForm.email}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, email: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Temporary password
            <input
              type="password"
              value={createForm.password}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, password: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Phone
            <input
              value={createForm.phone}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, phone: event.target.value }))
              }
            />
          </label>
          <label>
            Role
            <select
              value={createForm.role}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  role: event.target.value as UserRole,
                }))
              }
            >
              <option value="employee">employee</option>
              <option value="driver">driver</option>
              <option value="admin">admin</option>
            </select>
          </label>
          {createForm.role === "admin" && (
            <label>
              Admin scope
              <select
                value={createForm.admin_scope}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    admin_scope: event.target.value as AdminScope,
                  }))
                }
              >
                <option value="supervisor">supervisor</option>
                <option value="dispatcher">dispatcher</option>
                <option value="viewer">viewer</option>
                <option value="support">support</option>
              </select>
            </label>
          )}
        </EntityForm>
      </div>
    </AppLayout>
  );
}
