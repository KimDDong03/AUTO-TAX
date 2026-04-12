import React from "react";
import { SectionMessage, StatusBadge, type StatusBadgeTone } from "../../../components/ui";
import type { Customer } from "../../../types";

type LegacyTone = "success" | "warn" | "danger" | "default";

function mapLegacyToneToStatusBadgeTone(tone: LegacyTone): StatusBadgeTone {
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

export type CustomerDetailReadinessView = {
  label: string;
  tone: "success" | "warn" | "danger";
  reason: string;
  actionLabel?: string;
  onAction?: () => void;
};

export type CustomerDetailStatusCard = {
  label: string;
  value: string;
  note: string;
  tone: LegacyTone;
};

export type CustomerDetailIssueView = {
  key: string;
  label: string;
  tone: "success" | "warn" | "danger";
  actionLabel?: string;
  onAction?: () => void;
};

type CustomerDetailOverviewProps = {
  customer: Customer;
  readiness: CustomerDetailReadinessView;
  statusCards: CustomerDetailStatusCard[];
  issues: CustomerDetailIssueView[];
  heroActions?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  certificateNotice?: string;
};

export function CustomerDetailOverview(props: CustomerDetailOverviewProps) {
  return (
    <div className="stitch-customer-detail-top">
      <div className="stitch-customer-detail-hero">
        <div className="stitch-customer-detail-copy">
          <span className="stitch-customer-detail-overline">선택 고객</span>
          <strong>{props.customer.corpName}</strong>
          <span>
            {props.customer.customerName} · {props.customer.businessNumber}
          </span>
        </div>
        {props.heroActions ? <div className="stitch-customer-detail-actions">{props.heroActions}</div> : null}
      </div>
      <p className="stitch-customer-detail-address">{props.customer.addr}</p>
      <div className="stitch-customer-detail-status-row">
        <StatusBadge tone={mapLegacyToneToStatusBadgeTone(props.readiness.tone)}>{props.readiness.label}</StatusBadge>
        {props.readiness.reason !== "준비 완료" ? <span className="stitch-customer-detail-status-note">{props.readiness.reason}</span> : null}
        {props.readiness.actionLabel ? (
          <button type="button" className="btn-secondary" onClick={() => props.readiness.onAction?.()}>
            {props.readiness.actionLabel}
          </button>
        ) : null}
      </div>
      <div className="stitch-customer-status-grid" aria-label="고객 상태 요약">
        {props.statusCards.map((card) => (
          <article key={card.label} className={`stitch-customer-status-card tone-${card.tone}`}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.note}</p>
          </article>
        ))}
      </div>
      {props.issues.length > 0 ? (
        <>
          <div className="stitch-customer-section-head">
            <strong>확인 필요 항목</strong>
            <span>{props.issues.length}건</span>
          </div>
          <div className="stitch-customer-issue-list" aria-label="발행 준비 상태">
            {props.issues.map((issue) => (
              <article
                key={issue.key}
                className={
                  issue.tone === "danger"
                    ? "stitch-customer-issue-card tone-danger"
                    : issue.tone === "warn"
                      ? "stitch-customer-issue-card tone-warn"
                      : "stitch-customer-issue-card tone-success"
                }
              >
                <div className="stitch-customer-issue-card-copy">
                  <StatusBadge tone={mapLegacyToneToStatusBadgeTone(issue.tone)}>
                    {issue.tone === "danger" ? "중요" : issue.tone === "warn" ? "점검" : "완료"}
                  </StatusBadge>
                  <span className="stitch-customer-issue-text">{issue.label}</span>
                </div>
                {issue.actionLabel ? (
                  <button type="button" className="btn-secondary" onClick={() => issue.onAction?.()}>
                    {issue.actionLabel}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
      {props.certificateNotice ? (
        <SectionMessage tone="info" badgeLabel="인증서" title="인증서 상태 안내" iconName="cert">
          {props.certificateNotice}
        </SectionMessage>
      ) : null}
      {props.secondaryActions ? (
        <details className="stitch-customer-detail-secondary">
          <summary>더보기</summary>
          <div className="stitch-customer-detail-secondary-actions">{props.secondaryActions}</div>
        </details>
      ) : null}
    </div>
  );
}
