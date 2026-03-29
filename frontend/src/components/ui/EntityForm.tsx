import type { ReactNode } from "react";

interface EntityFormProps {
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  submittingLabel?: string;
  busy?: boolean;
  disabled?: boolean;
}

export function EntityForm({
  title,
  description,
  children,
  onSubmit,
  submitLabel,
  submittingLabel = "Saving...",
  busy = false,
  disabled = false,
}: EntityFormProps) {
  return (
    <form className="panel inset-panel stack" onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">Form</p>
        <h3>{title}</h3>
        {description && <p className="muted-copy">{description}</p>}
      </div>
      {children}
      <button className="primary-button" disabled={disabled || busy} type="submit">
        {busy ? submittingLabel : submitLabel}
      </button>
    </form>
  );
}
