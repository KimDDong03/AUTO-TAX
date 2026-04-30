import React from "react";

function getStatIcon(label: string): string {
  if (label.includes("고객")) return "group";
  if (label.includes("발행 대상")) return "issue";
  if (label.includes("발행 완료")) return "complete";
  if (label.includes("실패")) return "review";
  if (label.includes("미매칭")) return "unmatched";
  return "dashboard";
}

export function Icon(props: { name: string; className?: string }) {
  const iconClassName = props.className ? `glyph ${props.className}` : "glyph";

  switch (props.name) {
    case "dashboard":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 10.5L12 4L20 10.5V19A1 1 0 0 1 19 20H5A1 1 0 0 1 4 19V10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9 20V13H15V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case "group":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
            <path d="M4 19C4 15.9 6.4 14 9 14C11.6 14 14 15.9 14 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M16.5 11.5C18.4 11.5 20 9.9 20 8C20 6.1 18.4 4.5 16.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M16.5 14C18.8 14 21 15.5 21 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
      );
    case "certificate":
    case "cert":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 10H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M8 14H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
      );
    case "initial":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="6" y="4.5" width="12" height="15" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9 4.5V3.5H15V4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.2 9.2L10.7 10.7L13.8 7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.2 14.2L10.7 15.7L13.8 12.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case "settings":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M19 12A7 7 0 0 0 18.9 10.9L21 9.3L19.2 6.2L16.7 7A7 7 0 0 0 14.8 5.9L14.4 3H9.6L9.2 5.9A7 7 0 0 0 7.3 7L4.8 6.2L3 9.3L5.1 10.9A7 7 0 0 0 5 12C5 12.4 5 12.8 5.1 13.1L3 14.7L4.8 17.8L7.3 17A7 7 0 0 0 9.2 18.1L9.6 21H14.4L14.8 18.1A7 7 0 0 0 16.7 17L19.2 17.8L21 14.7L18.9 13.1C19 12.8 19 12.4 19 12Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case "review":
    case "issue":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="5" y="4" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9 9H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M9 13H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M17 8L19.5 10.5L15.5 14.5L13 15L13.5 12.5L17 8Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case "unmatched":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <rect x="3.5" y="6" width="17" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M5 8L12 13L19 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case "complete":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8.5 12L11 14.5L15.5 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case "ops":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 3L19 6V11C19 15.4 16 18.9 12 20C8 18.9 5 15.4 5 11V6L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.5 12L11.2 13.7L14.8 10.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case "refresh":
    case "sync":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M20 7V11H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 17V13H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6.5 10C7.4 7.7 9.5 6 12 6C14.2 6 16.2 7.2 17.2 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M17.5 14C16.6 16.3 14.5 18 12 18C9.8 18 7.8 16.8 6.8 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
      );
    case "search":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="6.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M16 16L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
      );
    case "bell":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M7.5 10.2C7.5 7.6 9.5 5.5 12 5.5C14.5 5.5 16.5 7.6 16.5 10.2V13.2L18.2 16.1H5.8L7.5 13.2V10.2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M10.2 18C10.6 19 11.2 19.5 12 19.5C12.8 19.5 13.4 19 13.8 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
      );
    case "help":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9.6 9.5C9.8 8.1 10.9 7.2 12.2 7.2C13.6 7.2 14.8 8.2 14.8 9.7C14.8 10.9 14.1 11.5 13.2 12.1C12.3 12.7 11.8 13.1 11.8 14.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="16.8" r="0.9" fill="currentColor" />
          </svg>
        </span>
      );
    case "user":
      return (
        <span className={iconClassName} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8.2" r="3.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M6 19C6 15.9 8.7 14 12 14C15.3 14 18 15.9 18 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
      );
    default:
      return <span className={iconClassName}>{props.name.slice(0, 2).toUpperCase()}</span>;
  }
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

function parseDialogMessageLine(line: string): { label: string; value: string } | null {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const label = line.slice(0, separatorIndex).trim();
  const value = line.slice(separatorIndex + 1).trim();
  return label ? { label, value: value || "-" } : null;
}

function AppDialogMessage(props: { message: string }) {
  const lines = props.message
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const parsedLines = lines.map((line, index) => ({
    line,
    index,
    detail: parseDialogMessageLine(line)
  }));
  const hasDetailRows = parsedLines.some((item) => item.detail);

  if (!hasDetailRows) {
    return (
      <p id="app-dialog-message" className="app-dialog-message">
        {props.message}
      </p>
    );
  }

  return (
    <div id="app-dialog-message" className="app-dialog-message app-dialog-message-structured">
      {parsedLines.some((item) => !item.detail) ? (
        <div className="app-dialog-message-leads">
          {parsedLines
            .filter((item) => !item.detail)
            .map((item) => (
              <p key={`lead-${item.index}`}>{item.line}</p>
            ))}
        </div>
      ) : null}
      <dl className="app-dialog-detail-list">
        {parsedLines
          .filter(
            (item): item is { line: string; index: number; detail: { label: string; value: string } } =>
              item.detail !== null
          )
          .map((item) => (
            <div className="app-dialog-detail-row" key={`detail-${item.index}`}>
              <dt>{item.detail.label}</dt>
              <dd>{item.detail.value}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}

export function AppDialog(props: {
  dialog: AppDialogState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const toneClassName = props.dialog.tone === "default" ? "" : ` app-dialog-${props.dialog.tone}`;
  const kicker =
    props.dialog.kind === "confirm"
      ? "확인 필요"
      : props.dialog.tone === "danger"
        ? "오류"
        : props.dialog.tone === "warn"
          ? "확인"
          : props.dialog.tone === "success"
            ? "완료"
            : "안내";

  return (
    <div className="app-dialog-backdrop" role="presentation">
      <section
        className={`app-dialog${toneClassName}`}
        role={props.dialog.kind === "confirm" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
      >
        <header className="app-dialog-head">
          <span className="app-dialog-kicker">{kicker}</span>
          <h2 id="app-dialog-title">{props.dialog.title}</h2>
        </header>
        <AppDialogMessage message={props.dialog.message} />
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
