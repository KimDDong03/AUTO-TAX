import React from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleX,
  CircleHelp,
  ClipboardCheck,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FilePenLine,
  FileText,
  Filter,
  Home,
  LoaderCircle,
  Mail,
  MailX,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Undo2,
  User,
  Users,
  type LucideIcon
} from "lucide-react";
import {
  EmptyState as ConsoleEmptyState,
  InlineNotice,
  MetricCard,
  StatusBadge as ConsoleStatusBadge,
  WorkPanel,
  WorkPanelBody,
  WorkPanelHeader,
  type ConsoleTone
} from "./console";

function getStatIcon(label: string): string {
  if (label.includes("고객")) return "group";
  if (label.includes("발행 대상")) return "issue";
  if (label.includes("발행 완료")) return "complete";
  if (label.includes("실패")) return "review";
  if (label.includes("미매칭")) return "unmatched";
  return "dashboard";
}

const ICON_BY_NAME: Record<string, LucideIcon> = {
  "alert-triangle": AlertTriangle,
  bell: Bell,
  "circle-x": CircleX,
  certificate: FileCheck2,
  cert: FileCheck2,
  complete: CheckCircle2,
  dashboard: Home,
  document: FileText,
  download: Download,
  edit: Pencil,
  "file-text": FileText,
  filter: Filter,
  group: Users,
  help: CircleHelp,
  initial: ClipboardCheck,
  issue: FilePenLine,
  loading: LoaderCircle,
  "loader-circle": LoaderCircle,
  mail: Mail,
  "mail-x": MailX,
  ops: ShieldCheck,
  pencil: Pencil,
  plus: Plus,
  refresh: RefreshCw,
  review: FilePenLine,
  search: Search,
  send: Send,
  settings: Settings,
  sync: RefreshCw,
  trash: Trash2,
  undo: Undo2,
  unmatched: Mail,
  user: User,
  warning: AlertTriangle
};

export function Icon(props: { name: string; className?: string }) {
  const iconClassName = props.className ? `glyph ${props.className}` : "glyph";
  const IconComponent = ICON_BY_NAME[props.name];

  if (!IconComponent) {
    return <span className={iconClassName}>{props.name.slice(0, 2).toUpperCase()}</span>;
  }

  return (
    <span className={iconClassName} aria-hidden="true">
      <IconComponent size={18} strokeWidth={2} />
    </span>
  );
}

export function RevealIcon(props: { open: boolean }) {
  const IconComponent = props.open ? Eye : EyeOff;

  return <IconComponent className="reveal-icon" size={20} strokeWidth={2} aria-hidden="true" />;
}

export type CheckboxControlProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  containerClassName?: string;
  label?: React.ReactNode;
};

export const CheckboxControl = React.forwardRef<HTMLInputElement, CheckboxControlProps>(
  function CheckboxControl(props, ref) {
    const { className, containerClassName, label, ...inputProps } = props;
    const inputClassName = ["ui-checkbox-input", className].filter(Boolean).join(" ");
    const input = <input {...inputProps} ref={ref} type="checkbox" className={inputClassName} />;

    if (label === undefined || label === null) {
      return input;
    }

    return (
      <label className={["ui-checkbox", containerClassName].filter(Boolean).join(" ")}>
        {input}
        <span className="ui-checkbox-label">{label}</span>
      </label>
    );
  }
);

export type StatusBadgeTone = "default" | "success" | "warn" | "danger" | "info";

export function StatusBadge(props: {
  children: React.ReactNode;
  tone?: StatusBadgeTone;
  className?: string;
}) {
  const tone = props.tone ?? "default";
  const consoleTone: ConsoleTone =
    tone === "warn" ? "warning" : tone === "default" ? "default" : tone;

  return (
    <ConsoleStatusBadge tone={consoleTone} icon={false} className={props.className}>
      {props.children}
    </ConsoleStatusBadge>
  );
}

export function EmptyState(props: {
  title: React.ReactNode;
  body?: React.ReactNode;
  tone?: StatusBadgeTone;
  actions?: React.ReactNode;
  className?: string;
}) {
  const tone = props.tone ?? "default";
  const consoleTone: ConsoleTone =
    tone === "warn" ? "warning" : tone === "default" ? "default" : tone;

  return (
    <ConsoleEmptyState
      title={props.title}
      body={props.body}
      actions={props.actions}
      tone={consoleTone}
      className={props.className}
    />
  );
}

export function SectionMessage(props: {
  title?: React.ReactNode;
  children: React.ReactNode;
  tone?: StatusBadgeTone;
  actions?: React.ReactNode;
  className?: string;
}) {
  const tone = props.tone ?? "info";
  const consoleTone: ConsoleTone =
    tone === "warn" ? "warning" : tone === "default" ? "default" : tone;

  return (
    <InlineNotice title={props.title} tone={consoleTone} actions={props.actions} className={props.className}>
      {props.children}
    </InlineNotice>
  );
}

export function StatCard(props: { label: string; value: number | string; tone?: "default" | "warn" | "error" }) {
  const tone = props.tone === "warn" ? "warning" : props.tone === "error" ? "danger" : "default";

  return (
    <MetricCard
      label={props.label}
      value={props.value}
      tone={tone}
      className={`stat-${props.tone ?? "default"}`}
      icon={<Icon name={getStatIcon(props.label)} className="stat-card-icon" />}
    />
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
    <WorkPanel id={props.id} className={props.className}>
      <WorkPanelHeader title={props.title} description={props.subtitle} actions={props.actions} />
      <WorkPanelBody>{props.children}</WorkPanelBody>
    </WorkPanel>
  );
}

export type AppDialogTone = "default" | "success" | "warn" | "danger";

export type AppDialogState = {
  kind: "alert" | "confirm" | "progress";
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
    if (lines.length > 1) {
      return (
        <div id="app-dialog-message" className="app-dialog-message app-dialog-message-leads">
          {lines.map((line, index) => (
            <p key={`message-${index}`}>{line}</p>
          ))}
        </div>
      );
    }

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
  const progressClassName = props.dialog.kind === "progress" ? " app-dialog-progress" : "";
  const kicker =
    props.dialog.kind === "progress"
      ? "진행중"
      : props.dialog.kind === "confirm"
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
        className={`app-dialog${toneClassName}${progressClassName}`}
        role={props.dialog.kind === "confirm" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby="app-dialog-message"
      >
        <header className="app-dialog-head">
          {props.dialog.kind === "progress" ? <span className="app-dialog-progress-spinner" aria-hidden="true" /> : null}
          <span className="app-dialog-kicker">{kicker}</span>
          <h2 id="app-dialog-title">{props.dialog.title}</h2>
        </header>
        <AppDialogMessage message={props.dialog.message} />
        {props.dialog.kind === "progress" ? null : (
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
        )}
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
          <StatusBadge tone={props.done ? "success" : "danger"}>{props.done ? "완료" : "설정 필요"}</StatusBadge>
          {props.actions}
        </div>
      </header>
      {props.children}
    </section>
  );
}
