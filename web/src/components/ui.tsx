import type React from "react";

function getStatIcon(label: string): string {
  if (label.includes("고객")) return "group";
  if (label.includes("발행 대상")) return "issue";
  if (label.includes("발행 완료")) return "complete";
  if (label.includes("실패")) return "review";
  if (label.includes("미매칭")) return "unmatched";
  return "dashboard";
}

export function Icon(props: { name: string; className?: string }) {
  const glyphs: Record<string, string> = {
    dashboard: "DS",
    group: "CU",
    initial: "IN",
    review: "TX",
    settings: "SY",
    ops: "OP",
    issue: "IS",
    unmatched: "ML",
    cert: "CT",
    complete: "OK",
    refresh: "↻",
    sync: "⇄"
  };

  return <span className={props.className ? `glyph ${props.className}` : "glyph"}>{glyphs[props.name] ?? props.name.slice(0, 2).toUpperCase()}</span>;
}

export function RevealIcon(props: { open: boolean }) {
  return (
    <svg className="reveal-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12C3.9 8.8 7.4 6.5 12 6.5C16.6 6.5 20.1 8.8 22 12C20.1 15.2 16.6 17.5 12 17.5C7.4 17.5 3.9 15.2 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.1" stroke="currentColor" strokeWidth="1.8" />
      {props.open ? null : (
        <path
          d="M4 4L20 20"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function StatCard(props: { label: string; value: number | string; tone?: "default" | "warn" | "error" }) {
  return (
    <div className={`stat-card stat-${props.tone ?? "default"}`}>
      <div className="stat-card-head">
        <span>{props.label}</span>
        <Icon name={getStatIcon(props.label)} className="stat-card-icon" />
      </div>
      <strong>{props.value}</strong>
    </div>
  );
}

export function Panel(props: {
  id?: string;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={props.id} className={props.className ? `panel ${props.className}` : "panel"}>
      <header className="panel-header">
        <div>
          <h2>{props.title}</h2>
          {props.subtitle ? <p>{props.subtitle}</p> : null}
        </div>
        {props.actions ? <div className="panel-actions">{props.actions}</div> : null}
      </header>
      {props.children}
    </section>
  );
}

export type AppDialogTone = "default" | "success" | "warn" | "danger";

export type AppDialogState = {
  kind: "alert" | "confirm";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone: AppDialogTone;
};

export function AppDialog(props: {
  dialog: AppDialogState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="app-dialog-backdrop" role="presentation">
      <section
        className={props.dialog.tone === "danger" ? "app-dialog app-dialog-danger" : "app-dialog"}
        role={props.dialog.kind === "confirm" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
      >
        <div className="app-dialog-head">
          <span
            className={
              props.dialog.tone === "danger"
                ? "chip chip-danger"
                : props.dialog.tone === "warn"
                  ? "chip chip-warn"
                  : props.dialog.tone === "success"
                    ? "chip chip-success"
                    : "chip"
            }
          >
            {props.dialog.kind === "confirm" ? "확인 필요" : "안내"}
          </span>
          <div>
            <h2 id="app-dialog-title">{props.dialog.title}</h2>
            <p id="app-dialog-message" className="app-dialog-message">
              {props.dialog.message}
            </p>
          </div>
        </div>
        <div className="app-dialog-actions">
          {props.dialog.kind === "confirm" ? (
            <button type="button" className="btn-secondary" onClick={props.onCancel}>
              {props.dialog.cancelLabel ?? "취소"}
            </button>
          ) : null}
          <button type="button" onClick={props.onConfirm}>
            {props.dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function SetupPanel(props: {
  step: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  note?: React.ReactNode;
}) {
  return (
    <section className={props.className ? `panel setup-panel ${props.className}` : "panel setup-panel"}>
      <header className="panel-header setup-panel-header">
        <div className="setup-panel-title">
          <span className="setup-order">{props.step}</span>
          <div>
            <h2>{props.title}</h2>
            {props.note ? <p>{props.note}</p> : null}
          </div>
        </div>
        <div className="panel-actions">
          <span className={`chip ${props.done ? "chip-success" : "chip-danger"}`}>{props.done ? "완료" : "설정 필요"}</span>
          {props.actions}
        </div>
      </header>
      {props.children}
    </section>
  );
}
