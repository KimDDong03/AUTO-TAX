import React from "react";
import { EmptyState, StatusBadge } from "../../../components/ui";

type CustomerListEmptyStateProps = {
  title: string;
  description: string;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
  primaryActionDisabled?: boolean;
  secondaryActionLabel: string;
  onSecondaryAction: () => void;
  secondaryActionDisabled?: boolean;
};

export function CustomerListEmptyState(props: CustomerListEmptyStateProps) {
  return (
    <EmptyState
      compact
      align="center"
      title={props.title}
      description={props.description}
      actions={
        <>
          <button type="button" onClick={props.onPrimaryAction} disabled={props.primaryActionDisabled}>
            {props.primaryActionLabel}
          </button>
          <button type="button" className="btn-secondary" onClick={props.onSecondaryAction} disabled={props.secondaryActionDisabled}>
            {props.secondaryActionLabel}
          </button>
        </>
      }
    >
      <div className="stitch-customer-table-empty-preview">
        <span>대표자·사업자번호 저장</span>
        <span>팝빌/인증서 연결</span>
        <span>즉시 발행 고객 분류</span>
      </div>
      <div className="stitch-customer-table-empty-sample">
        <div className="stitch-empty-sample-meta">
          <span>예시 고객</span>
          <span>등록 직후</span>
        </div>
        <div className="stitch-empty-preview-table">
          <div className="stitch-empty-preview-head">
            <span>고객</span>
            <span>사업자번호</span>
            <span>발행 준비</span>
            <span>연결 상태</span>
          </div>
          <div className="stitch-empty-preview-row">
            <strong>해성태양광</strong>
            <span>123-45-67890</span>
            <StatusBadge compact tone="warning">
              검수 후 발행
            </StatusBadge>
            <span>연결 필요</span>
          </div>
          <div className="stitch-empty-preview-row">
            <strong>동해에너지</strong>
            <span>234-56-78901</span>
            <StatusBadge compact tone="success">
              즉시 발행
            </StatusBadge>
            <span>연결 완료</span>
          </div>
        </div>
        <small>첫 고객을 등록하면 고객 목록과 상세 운영 화면이 바로 활성화됩니다.</small>
      </div>
    </EmptyState>
  );
}
