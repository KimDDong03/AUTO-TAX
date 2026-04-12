import React from "react";

function joinClassNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

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
    dashboard: "assignment_turned_in",
    group: "groups",
    initial: "preliminary",
    review: "warning",
    settings: "settings_applications",
    ops: "admin_panel_settings",
    issue: "description",
    unmatched: "mail",
    cert: "verified_user",
    complete: "task_alt",
    info: "info",
    success: "task_alt",
    danger: "error",
    empty: "inbox",
    refresh: "refresh",
    sync: "sync"
  };

  return (
    <span className={props.className ? `material-symbols-outlined ui-icon ${props.className}` : "material-symbols-outlined ui-icon"}>
      {glyphs[props.name] ?? "radio_button_checked"}
    </span>
  );
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

export type StatusBadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

function getStatusBadgeClassName(tone: StatusBadgeTone) {
  switch (tone) {
    case "info":
      return "ui-status-badge-info";
    case "success":
      return "ui-status-badge-success";
    case "warning":
      return "ui-status-badge-warning";
    case "danger":
      return "ui-status-badge-danger";
    case "neutral":
    default:
      return "ui-status-badge-neutral";
  }
}

function getSectionMessageBadgeLabel(tone: StatusBadgeTone) {
  switch (tone) {
    case "success":
      return "정상";
    case "warning":
      return "주의";
    case "danger":
      return "오류";
    case "neutral":
      return "안내";
    case "info":
    default:
      return "진행";
  }
}

function getSectionMessageIconName(tone: StatusBadgeTone) {
  switch (tone) {
    case "success":
      return "success";
    case "warning":
      return "review";
    case "danger":
      return "danger";
    case "neutral":
    case "info":
    default:
      return "info";
  }
}

export function StatusBadge(props: React.HTMLAttributes<HTMLSpanElement> & { tone?: StatusBadgeTone; compact?: boolean }) {
  const { className, tone = "neutral", compact = false, ...rest } = props;

  return (
    <span
      className={joinClassNames("ui-status-badge", getStatusBadgeClassName(tone), compact && "is-compact", className)}
      {...rest}
    />
  );
}

export function SectionMessage(props: {
  title: string;
  children?: React.ReactNode;
  tone?: StatusBadgeTone;
  className?: string;
  actions?: React.ReactNode;
  badgeLabel?: string;
  iconName?: string;
}) {
  const tone = props.tone ?? "info";
  const liveMode = tone === "danger" || tone === "warning" ? "assertive" : "polite";

  return (
    <section
      className={joinClassNames("ui-section-message", `ui-section-message-${tone}`, props.className)}
      role={tone === "danger" ? "alert" : "status"}
      aria-live={liveMode}
    >
      <div className="ui-section-message-main">
        <span className="ui-section-message-icon" aria-hidden="true">
          <Icon name={props.iconName ?? getSectionMessageIconName(tone)} />
        </span>
        <div className="ui-section-message-body">
          <StatusBadge tone={tone}>{props.badgeLabel ?? getSectionMessageBadgeLabel(tone)}</StatusBadge>
          <div className="ui-section-message-copy">
            <strong>{props.title}</strong>
            {typeof props.children === "string" ? <p>{props.children}</p> : props.children}
          </div>
        </div>
      </div>
      {props.actions ? <div className="ui-section-message-actions">{props.actions}</div> : null}
    </section>
  );
}

export function EmptyState(props: {
  title: string;
  description?: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  iconName?: string;
  compact?: boolean;
  align?: "left" | "center";
}) {
  return (
    <section
      className={joinClassNames(
        "ui-empty-state",
        props.compact && "is-compact",
        props.align === "center" && "is-centered",
        props.className
      )}
      role="status"
      aria-live="polite"
    >
      <span className="ui-empty-state-icon" aria-hidden="true">
        <Icon name={props.iconName ?? "empty"} />
      </span>
      <div className="ui-empty-state-copy">
        <strong>{props.title}</strong>
        {typeof props.description === "string" ? <p>{props.description}</p> : props.description}
      </div>
      {props.actions ? <div className="ui-empty-state-actions">{props.actions}</div> : null}
      {props.children ? <div className="ui-empty-state-extra">{props.children}</div> : null}
    </section>
  );
}

export function StatCard(props: {
  label: string;
  value: number;
  tone?: "default" | "warn" | "error";
  meta?: string;
  icon?: string;
}) {
  return (
    <div className={`stat-card stat-${props.tone ?? "default"}`}>
      <div className="stat-card-head">
        <span>{props.label}</span>
        <Icon name={props.icon ?? getStatIcon(props.label)} className="stat-card-icon" />
      </div>
      <strong>{props.value}</strong>
      {props.meta ? <p className="stat-card-meta">{props.meta}</p> : null}
    </div>
  );
}

export function Panel(props: { title: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={props.className ? `panel ${props.className}` : "panel"}>
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

export function SurfaceCard(props: {
  as?: React.ElementType;
  className?: string;
  tone?: "default" | "dark";
  children: React.ReactNode;
}) {
  const Tag = props.as ?? "section";
  const toneClass = props.tone === "dark" ? "stitch-surface stitch-surface-dark" : "stitch-surface";
  return <Tag className={props.className ? `${toneClass} ${props.className}` : toneClass}>{props.children}</Tag>;
}

export function SurfaceButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, type, ...rest } = props;
  return <button type={type ?? "button"} className={className ? `stitch-surface-button ${className}` : "stitch-surface-button"} {...rest} />;
}

export type AppDialogTone = "default" | "success" | "warn" | "danger";

function getAppDialogStatusTone(tone: AppDialogTone): StatusBadgeTone {
  switch (tone) {
    case "success":
      return "success";
    case "warn":
      return "warning";
    case "danger":
      return "danger";
    case "default":
    default:
      return "neutral";
  }
}

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
          <StatusBadge tone={getAppDialogStatusTone(props.dialog.tone)}>
            {props.dialog.kind === "confirm" ? "확인 필요" : "안내"}
          </StatusBadge>
          <div>
            <h2 id="app-dialog-title">{props.dialog.title}</h2>
            <p id="app-dialog-message" className="app-dialog-message">{props.dialog.message}</p>
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
  note?: string;
  showStepOrder?: boolean;
}) {
  return (
    <section className={props.className ? `panel setup-panel ${props.className}` : "panel setup-panel"}>
      <header className="panel-header setup-panel-header">
        <div className="setup-panel-title">
          {props.showStepOrder === false ? null : <span className="setup-order">{props.step}</span>}
          <div>
            <h2>{props.title}</h2>
            {props.note ? <p>{props.note}</p> : null}
          </div>
        </div>
        <div className="panel-actions">
          <StatusBadge tone={props.done ? "success" : "danger"}>{props.done ? "완료" : "설정 필요"}</StatusBadge>
          {props.actions}
        </div>
      </header>
      {props.children}
    </section>
  );
}
