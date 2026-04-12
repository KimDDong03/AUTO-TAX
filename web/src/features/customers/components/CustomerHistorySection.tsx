import React from "react";
import { EmptyState, StatusBadge } from "../../../components/ui";
import type { InvoiceDraft } from "../../../types";

type CustomerHistorySectionProps = {
  mailboxDataLoading: boolean;
  drafts: InvoiceDraft[];
  busyKey: string | null;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  onShowDraftPopbillInfo: (draftId: number) => Promise<void>;
  onOpenDraftPopbillUrl: (draftId: number, path: "view-url" | "print-url") => Promise<void>;
  formatDateTime: (value: string | null) => string;
  formatMoney: (value: number) => string;
  getDraftConfirmNumber: (draft: InvoiceDraft) => string | null;
};

export function CustomerHistorySection(props: CustomerHistorySectionProps) {
  if (props.mailboxDataLoading && props.drafts.length === 0) {
    return (
      <div className="stitch-customer-history-list">
        <EmptyState compact align="center" iconName="sync" title="발행 이력을 불러오는 중입니다." />
      </div>
    );
  }

  if (props.drafts.length === 0) {
    return (
      <div className="stitch-customer-history-list">
        <EmptyState
          compact
          align="center"
          iconName="info"
          title="이 고객의 발행 이력이 없습니다."
          description="첫 발행이 완료되면 여기서 최근 처리 내역과 팝빌 정보를 함께 확인할 수 있습니다."
        />
      </div>
    );
  }

  return (
    <div className="stitch-customer-history-list">
      {props.drafts.map((draft) => {
        const confirmNumber = props.getDraftConfirmNumber(draft);

        return (
          <article key={draft.id} className="stitch-customer-history-card">
            <div className="stitch-customer-history-head">
              <div>
                <strong>{draft.itemName}</strong>
                <span>{props.formatDateTime(draft.issuedAt)}</span>
              </div>
              <StatusBadge tone="success">발행 완료</StatusBadge>
            </div>
            <div className="stitch-customer-history-meta">
              <span>공급가액 {props.formatMoney(draft.supplyCost)}원</span>
              <span>합계 {props.formatMoney(draft.totalAmount)}원</span>
              <span>관리번호 {draft.popbillMgtKey || "-"}</span>
              <span>승인번호 {confirmNumber ?? "-"}</span>
            </div>
            <div className="stitch-customer-history-actions">
              <button
                className="btn-secondary"
                disabled={props.busyKey !== null}
                onClick={() => void props.runAction(`draft-info-${draft.id}`, async () => props.onShowDraftPopbillInfo(draft.id))}
              >
                상태조회
              </button>
              <button
                className="btn-secondary"
                disabled={props.busyKey !== null}
                onClick={() => void props.runAction(`draft-view-customer-${draft.id}`, async () => props.onOpenDraftPopbillUrl(draft.id, "view-url"))}
              >
                보기
              </button>
              <button
                className="btn-secondary"
                disabled={props.busyKey !== null}
                onClick={() => void props.runAction(`draft-print-customer-${draft.id}`, async () => props.onOpenDraftPopbillUrl(draft.id, "print-url"))}
              >
                인쇄
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
