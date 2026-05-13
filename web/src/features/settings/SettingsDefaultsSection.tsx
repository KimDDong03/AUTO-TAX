import React, { useEffect, useMemo, useState } from "react";
import { RevealIcon, SetupPanel } from "../../components/ui";
import {
  DEFAULT_ISSUE_COMPLETE_SMS_TEMPLATE,
  POPBILL_XMS_LMS_BYTE_LIMIT,
  POPBILL_XMS_SMS_BYTE_LIMIT,
  getPopbillMessageByteLength,
  resolveIssueCompleteSmsTemplate
} from "../../issueMessageTemplate";
import type { SettingsDefaultsSectionModel } from "./settingsSectionModels";

type SettingsDefaultsSectionProps = {
  model: SettingsDefaultsSectionModel;
};

export function SettingsDefaultsSection({
  model
}: SettingsDefaultsSectionProps) {
  const customers = model.customerMessages.customers;
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(() => customers[0]?.id ?? null);
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? customers[0] ?? null,
    [customers, selectedCustomerId]
  );
  const [messageTemplateDraft, setMessageTemplateDraft] = useState("");
  const savedMessageTemplate = selectedCustomer?.issueCompleteSmsTemplate ?? "";
  const resolvedMessageTemplate = resolveIssueCompleteSmsTemplate(messageTemplateDraft);
  const messageTemplateBytes = getPopbillMessageByteLength(resolvedMessageTemplate);
  const messageTemplateOverLimit = messageTemplateBytes > POPBILL_XMS_LMS_BYTE_LIMIT;
  const messageTemplateKind = messageTemplateBytes <= POPBILL_XMS_SMS_BYTE_LIMIT ? "SMS" : "LMS";
  const messageTemplateChanged = messageTemplateDraft !== savedMessageTemplate;

  useEffect(() => {
    if (customers.length === 0) {
      setSelectedCustomerId(null);
      return;
    }
    if (!selectedCustomerId || !customers.some((customer) => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(customers[0]!.id);
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    setMessageTemplateDraft(savedMessageTemplate);
  }, [selectedCustomer?.id, savedMessageTemplate]);

  return (
    <SetupPanel
      step={2}
      className="panel-settings-popbill"
      title="발행 설정"
      done={model.done}
      note="신규 고객 기본 발행값을 확인합니다."
    >
      <div className="settings-field-stack">
        <section className="settings-field-group">
          <div className="settings-field-group-head">
            <strong>필수 공통값</strong>
            <span>담당자 정보와 인증서 발급용 값을 관리합니다.</span>
          </div>
          <div className="settings-defaults-grid">
            <label className="settings-defaults-cell">
              담당자 이름
              <input
                value={model.fields.operatorContactName}
                onChange={(event) =>
                  model.onOperatorContactNameChange(event.target.value)
                }
                placeholder="담당자 이름"
              />
            </label>

            <label className="settings-defaults-cell">
              담당자 연락처
              <input
                value={model.fields.operatorContactTel}
                onChange={(event) =>
                  model.onOperatorContactTelChange(event.target.value)
                }
                placeholder="01012345678"
              />
            </label>

            <label className="settings-defaults-cell">
              담당자 이메일
              <input
                type="email"
                value={model.fields.operatorContactEmail}
                onChange={(event) =>
                  model.onOperatorContactEmailChange(event.target.value)
                }
                placeholder="operator@example.com"
              />
            </label>

            <label className="settings-defaults-cell">
              공동인증서 발급용 임시 비밀번호
              <div className="password-field">
                <input
                  type={
                    model.reveals.renewalIssuePassword.visible
                      ? "text"
                      : "password"
                  }
                  value={model.fields.renewalIssuePassword}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) =>
                    model.onRenewalIssuePasswordChange(event.target.value)
                  }
                  placeholder={
                    model.configured.renewalIssuePassword
                      ? "변경할 때만 다시 입력"
                      : "숫자 6자리 입력"
                  }
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={
                    model.reveals.renewalIssuePassword.visible
                      ? "발급용 임시 비밀번호 숨기기"
                      : "발급용 임시 비밀번호 보기"
                  }
                  onClick={model.reveals.renewalIssuePassword.toggle}
                >
                  <RevealIcon
                    open={model.reveals.renewalIssuePassword.visible}
                  />
                </button>
              </div>
              <div className="field-meta-row">
                <span className="field-hint">
                  {model.configured.renewalIssuePassword
                    ? "이미 저장된 값이 있습니다. 필요하면 다시 불러오세요."
                    : "공동인증서 발급/갱신 요청에 쓰는 6자리 번호입니다."}
                </span>
                {model.configured.renewalIssuePassword ? (
                  <div className="field-action-row">
                    <button
                      type="button"
                      className="btn-secondary field-inline-action"
                      disabled={model.busyKey !== null}
                      onClick={() =>
                        void model.onLoadCurrentRenewalIssuePassword()
                      }
                    >
                      저장된 임시 비밀번호 불러오기
                    </button>
                  </div>
                ) : null}
              </div>
            </label>

            <div className="settings-defaults-status">
              <strong>입력 상태</strong>
              <span>
                작업공간 운영값:{" "}
                {model.settingsHealth.operatorReady ? "준비됨" : "설정 필요"}
              </span>
            </div>
          </div>
        </section>

        <section className="settings-field-group settings-message-template-section">
          <div className="settings-field-group-head">
            <strong>고객별 발행 완료 문자</strong>
            <span>전자세금계산서 발행 후 고객에게 보내는 문자 양식을 고객별로 조정합니다.</span>
          </div>
          {customers.length === 0 ? (
            <div className="settings-action-feedback">
              <span className="chip chip-warn">고객 없음</span>
              <span>고객을 등록한 뒤 문자 양식을 설정할 수 있습니다.</span>
            </div>
          ) : (
            <div className="settings-message-template-editor">
              <label className="settings-defaults-cell settings-defaults-cell-span-2">
                고객 선택
                <select
                  value={selectedCustomer?.id ?? ""}
                  onChange={(event) => setSelectedCustomerId(Number(event.target.value))}
                >
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.corpName || customer.customerName} · {customer.businessNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-defaults-cell settings-defaults-cell-span-2 settings-message-template-field">
                문자 양식
                <textarea
                  rows={5}
                  value={messageTemplateDraft}
                  placeholder={DEFAULT_ISSUE_COMPLETE_SMS_TEMPLATE}
                  onChange={(event) => setMessageTemplateDraft(event.target.value)}
                />
                <span className={messageTemplateOverLimit ? "field-hint tone-danger" : "field-hint"}>
                  {messageTemplateKind} {messageTemplateBytes}/{POPBILL_XMS_LMS_BYTE_LIMIT}byte · 변수 {"{회사명}"} {"{고객명}"} {"{발전소명}"} {"{금액}"}
                </span>
                {messageTemplateOverLimit ? (
                  <span className="field-hint tone-danger">
                    팝빌 LMS 최대 {POPBILL_XMS_LMS_BYTE_LIMIT}byte를 넘었습니다.
                  </span>
                ) : null}
              </label>

              <div className="settings-message-template-preview settings-defaults-cell settings-defaults-cell-span-2">
                <strong>미리보기</strong>
                <p>{resolvedMessageTemplate}</p>
              </div>

              <div className="settings-message-template-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!messageTemplateChanged || model.customerMessages.busyKey !== null}
                  onClick={() => setMessageTemplateDraft(savedMessageTemplate)}
                >
                  되돌리기
                </button>
                <button
                  type="button"
                  disabled={
                    !selectedCustomer ||
                    !messageTemplateChanged ||
                    messageTemplateOverLimit ||
                    model.customerMessages.busyKey !== null
                  }
                  onClick={() => {
                    if (!selectedCustomer) return;
                    void model.customerMessages.onSaveIssueCompleteSmsTemplate(
                      selectedCustomer.id,
                      messageTemplateDraft
                    );
                  }}
                >
                  문자 양식 저장
                </button>
              </div>
            </div>
          )}
        </section>

      </div>
    </SetupPanel>
  );
}
