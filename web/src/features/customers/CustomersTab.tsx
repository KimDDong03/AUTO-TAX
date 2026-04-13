import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { Panel } from "../../components/ui";
import type { Customer, InvoiceDraft } from "../../types";

type CustomerFormState = {
  id: number | null;
  customerName: string;
  businessNumber: string;
  corpName: string;
  addr: string;
  bizType: string;
  bizClass: string;
  issueMode: "review" | "auto";
  popbillUserId: string;
  popbillPassword: string;
  renewalContactMobile: string;
  memo: string;
};

type CustomerDetailTabId = "info" | "history";
type CustomerListFilter = "all" | "blocked" | "ready" | "expiring" | "unjoined";
type CustomerIssueReadiness = {
  canIssueNow: boolean;
  label: string;
  tone: "success" | "warn" | "danger";
  reason: string;
};

type CustomerIssueChecklistItem = {
  key: string;
  label: string;
  tone: "success" | "warn" | "danger";
  actionLabel?: string;
  actionKind?: "join-popbill" | "register-certificate" | "check-certificate";
};

type CustomerRenewalCandidateView = {
  customerId: number;
  customerName: string;
  corpName: string;
  certificateCn: string;
  certificateExpireDate: string | null;
  certificateUsage: string;
  statusText: string;
  statusTone: "success" | "warn" | "danger" | "default";
  paymentAmount: string | null;
  canOpenPayment: boolean;
};

type CustomersTabProps = {
  customers: Customer[];
  expiredCertCustomers: Customer[];
  expiringSoonCustomers: Customer[];
  filteredCustomers: Customer[];
  selectedCustomer: Customer | null;
  selectedCustomerReadiness: CustomerIssueReadiness | null;
  selectedCustomerIssues: CustomerIssueChecklistItem[];
  selectedCustomerIssuedDrafts: InvoiceDraft[];
  blockedCustomerCount: number;
  readyCustomerCount: number;
  expiringSoonCustomerCount: number;
  popbillPendingCustomerCount: number;
  managedCustomerCount: number;
  managedCustomerLimit: number | null;
  hasReachedManagedCustomerLimit: boolean;
  busyKey: string | null;
  isSavingCustomer: boolean;
  customerSearchQuery: string;
  customerListFilter: CustomerListFilter;
  customerDetailTab: CustomerDetailTabId;
  customerForm: CustomerFormState;
  customerCertNotice: string;
  customerAddressResolveMessage: string;
  mailboxDataLoading: boolean;
  canUseCustomerRenewalAssistant: boolean;
  customerRenewalAssistantOnline: boolean;
  customerRenewalAssistantHelperVersion: string | null;
  customerRenewalAssistantHelperMessage: string;
  customerRenewalLoadedCertificateCount: number;
  renewableCustomers: CustomerRenewalCandidateView[];
  customerNameInputRef: React.RefObject<HTMLInputElement | null>;
  customerAddressLookupRef: React.MutableRefObject<string>;
  setCustomerSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setCustomerListFilter: React.Dispatch<React.SetStateAction<CustomerListFilter>>;
  setCustomerDetailTab: React.Dispatch<React.SetStateAction<CustomerDetailTabId>>;
  setCustomerForm: React.Dispatch<React.SetStateAction<CustomerFormState>>;
  setCustomerAddressResolveMessage: React.Dispatch<React.SetStateAction<string>>;
  onCreateCustomer: () => void;
  onRefreshCustomerRenewalAssistant: () => Promise<void>;
  onLoadCustomerRenewalCertificates: () => Promise<void>;
  onStartCustomerRenewal: (customerId: number) => Promise<void>;
  onSelectCustomer: (customer: Customer) => void;
  onSaveCustomer: () => Promise<void>;
  onJoinCustomerPopbill: (customerId: number) => Promise<void>;
  onOpenCustomerCertRegistration: (customerId: number) => Promise<void>;
  onRefreshCustomerCertificateStatus: (customerId: number) => Promise<void>;
  onRefreshAllCertificateStatuses: () => Promise<void>;
  onResetPopbillLink: (customer: Customer) => Promise<void>;
  onDeleteCustomer: (customer: Customer) => Promise<void>;
  onShowDraftPopbillInfo: (draftId: number) => Promise<void>;
  onOpenDraftPopbillUrl: (draftId: number, path: "view-url" | "print-url") => Promise<void>;
  resolveCustomerAddress: () => Promise<string>;
  runAction: (key: string, action: () => Promise<void>, options?: { reload?: boolean }) => Promise<void>;
  formatCertificateExpireDate: (value: string | null) => string;
  getCustomerIssueReadiness: (customer: Customer) => CustomerIssueReadiness;
  getCustomerCertificateSummary: (customer: Customer) => string;
  getCustomerPopbillSummary: (customer: Customer) => string;
  getIssueModeLabel: (issueMode: "review" | "auto") => string;
  getDraftConfirmNumber: (draft: InvoiceDraft) => string | null;
  formatDateTime: (value: string | null) => string;
  formatMoney: (value: number) => string;
};

export function CustomersTab(props: CustomersTabProps) {
  const selectedCustomer = props.selectedCustomer;
  const selectedCustomerReadiness = props.selectedCustomerReadiness;
  const visibleCustomerIssues = props.selectedCustomerIssues.filter((issue) => issue.tone !== "success" || Boolean(issue.actionLabel));
  const inlineCustomerIssue =
    selectedCustomerReadiness && visibleCustomerIssues.length === 1 && visibleCustomerIssues[0]?.label === selectedCustomerReadiness.reason
      ? visibleCustomerIssues[0]
      : null;
  const stackedCustomerIssues = inlineCustomerIssue ? [] : visibleCustomerIssues;
  const [recentCustomerIds, setRecentCustomerIds] = useState<number[]>([]);

  useEffect(() => {
    if (!selectedCustomer) return;
    setRecentCustomerIds((previous) => [selectedCustomer.id, ...previous.filter((id) => id !== selectedCustomer.id)].slice(0, 6));
  }, [selectedCustomer?.id]);

  const recentCustomers = useMemo(
    () =>
      recentCustomerIds
        .map((customerId) => props.customers.find((customer) => customer.id === customerId) ?? null)
        .filter((customer): customer is Customer => customer !== null),
    [props.customers, recentCustomerIds]
  );

  const activeFilterCopy: Record<
    CustomerListFilter,
    {
      title: string;
      subtitle: string;
      empty: string;
    }
  > = {
    all: {
      title: "전체 고객",
      subtitle: "전체 고객과 현재 발행 준비 상태를 함께 봅니다.",
      empty: "아직 등록된 고객이 없습니다."
    },
    blocked: {
      title: "지금 막힌 고객",
      subtitle: "발행이 안 되는 이유부터 해결합니다.",
      empty: "지금 발행이 막힌 고객이 없습니다."
    },
    ready: {
      title: "지금 발행 가능한 고객",
      subtitle: "바로 초안을 검토하거나 발행할 수 있습니다.",
      empty: "지금 바로 발행할 고객이 없습니다."
    },
    expiring: {
      title: "인증서 곧 만료",
      subtitle: "만료 전 점검이 필요한 고객만 모아봅니다.",
      empty: "지금 점검이 필요한 인증서 고객이 없습니다."
    },
    unjoined: {
      title: "연결 마무리 필요",
      subtitle: "팝빌 가입이나 인증서 연결이 덜 끝난 고객입니다.",
      empty: "연결 마무리가 필요한 고객이 없습니다."
    }
  };

  const focusCustomerList = (filter: CustomerListFilter) => {
    props.setCustomerSearchQuery("");
    props.setCustomerListFilter(filter);
  };

  const queueCards: Array<{
    key: CustomerListFilter;
    label: string;
    count: number;
    tone: "danger" | "warn" | "success";
    description: string;
  }> = [
    {
      key: "blocked",
      label: "발행 막힘",
      count: props.blockedCustomerCount,
      tone: props.blockedCustomerCount > 0 ? "danger" : "success",
      description:
        props.blockedCustomerCount > 0
          ? "왜 막혔는지부터 해결하세요."
          : "지금 막힌 고객이 없습니다."
    },
    {
      key: "expiring",
      label: "인증서 만료 주의",
      count: props.expiringSoonCustomerCount,
      tone: props.expiringSoonCustomerCount > 0 ? "warn" : "success",
      description:
        props.expiringSoonCustomerCount > 0
          ? "만료 전 점검이 필요합니다."
          : "지금 만료 주의 대상이 없습니다."
    },
    {
      key: "unjoined",
      label: "연결 마무리",
      count: props.popbillPendingCustomerCount,
      tone: props.popbillPendingCustomerCount > 0 ? "warn" : "success",
      description:
        props.popbillPendingCustomerCount > 0
          ? "가입 또는 연결이 필요합니다."
          : "연결 미완료 고객이 없습니다."
    },
    {
      key: "ready",
      label: "지금 발행 가능",
      count: props.readyCustomerCount,
      tone: props.readyCustomerCount > 0 ? "success" : "warn",
      description:
        props.readyCustomerCount > 0
          ? "지금 바로 발행 가능합니다."
        : "발행 가능한 고객이 아직 없습니다."
    }
  ];
  const getCustomerCertificateDays = (customer: Customer) => {
    if (!customer.popbillCertExpireDate) return null;
    const expireTime = new Date(customer.popbillCertExpireDate).getTime();
    if (!Number.isFinite(expireTime)) return null;
    return Math.ceil((expireTime - Date.now()) / (1000 * 60 * 60 * 24));
  };
  const getCustomerNextStep = (customer: Customer) => {
    const days = getCustomerCertificateDays(customer);
    if (customer.popbillState !== "joined") {
      return {
        title: "팝빌 가입 마무리",
        body: "이 고객 전용 발행 계정을 먼저 만들어야 실제 발행으로 넘어갈 수 있습니다."
      };
    }
    if (!customer.popbillCertRegistered) {
      return {
        title: "전자세금용 인증서 등록",
        body: "전자세금용 공동인증서를 연결해야 실제 세금계산서 발행이 열립니다."
      };
    }
    if (days !== null && days < 0) {
      return {
        title: "인증서 상태 다시 확인",
        body: "만료된 인증서는 발행이 막힙니다. 만료일을 확인하고 갱신 흐름으로 이어가세요."
      };
    }
    if (days !== null && days <= 30) {
      return {
        title: "만료 전 갱신 일정 확인",
        body: `현재 인증서가 ${days}일 안에 만료됩니다. 인증서 관리에서 준비/결제 흐름을 확인하세요.`
      };
    }
    return {
      title: "지금 발행 가능",
      body: "고객 상세에서 기본값과 최근 발행 이력을 확인한 뒤 오늘 작업에서 초안을 검토하면 됩니다."
    };
  };
  const customerListGuide = (() => {
    if (props.customerSearchQuery.trim() !== "") {
      return {
        title: `검색어 "${props.customerSearchQuery.trim()}"로 고객을 좁혀 보고 있습니다.`,
        body: "왼쪽에서 고객 하나를 열면 발행 가능/불가, 막힌 이유, 다음 버튼이 바로 보입니다.",
        glossary: "연결 마무리 = 팝빌 가입 또는 전자세금용 인증서 등록이 아직 끝나지 않은 상태입니다."
      };
    }

    switch (props.customerListFilter) {
      case "blocked":
        return {
          title: "지금 발행이 막힌 고객만 모아 보고 있습니다.",
          body: "왼쪽 고객을 열고 가장 위 해결 버튼부터 눌러 한 명씩 풀면 됩니다.",
          glossary: "발행 막힘 = 팝빌 가입, 전자세금용 인증서, 인증서 만료 중 하나가 문제인 상태입니다."
        };
      case "ready":
        return {
          title: "지금 바로 발행 가능한 고객만 모아 보고 있습니다.",
          body: "발행 전 기본값이나 최근 이력을 다시 확인할 고객을 빠르게 고를 때 쓰세요.",
          glossary: "발행 가능 = 팝빌 가입과 전자세금용 인증서 등록이 모두 끝난 상태입니다."
        };
      case "expiring":
        return {
          title: "인증서 만료일이 가까운 고객만 보고 있습니다.",
          body: "만료 전 갱신 준비가 필요한 고객을 먼저 고르고, 인증서 관리 탭에서 이어서 처리하세요.",
          glossary: "만료 주의 = 30일 안에 인증서 만료일이 도래하는 상태입니다."
        };
      case "unjoined":
        return {
          title: "팝빌 가입이나 전자세금용 인증서 연결이 덜 끝난 고객만 보고 있습니다.",
          body: "첫 발행 전 마지막 준비를 마무리할 고객을 빠르게 찾을 때 쓰세요.",
          glossary: "연결 마무리 = 팝빌 가입 또는 전자세금용 인증서 등록이 남은 상태입니다."
        };
      default:
        return {
          title: "전체 고객을 발행 준비 상태와 함께 보고 있습니다.",
          body: "처음이면 막힌 고객부터 확인하고, 준비가 끝난 고객은 발행 가능 목록으로 옮겨 보세요.",
          glossary: "대표자명, 상호, 사업자번호로 검색하면 고객 상세까지 바로 이어집니다."
        };
    }
  })();
  const customerListEmptyState = (() => {
    if (props.customerSearchQuery.trim() !== "") {
      return {
        title: "검색 결과가 없습니다.",
        body: "대표자명, 상호, 사업자번호를 다시 확인하거나 검색어를 지우고 전체 고객에서 다시 찾아보세요.",
        tone: "info" as const
      };
    }
    if (props.customers.length === 0) {
      return {
        title: "아직 데이터가 없습니다.",
        body: "먼저 새 고객 등록을 눌러 대표자명, 사업자번호, 세금계산서 상호, 주소 4개부터 입력하세요.",
        tone: "info" as const
      };
    }
    if (props.customerListFilter === "blocked") {
      return {
        title: "문제가 없어서 비어 있습니다.",
        body: "지금 발행이 막힌 고객이 없습니다. 전체 고객으로 돌아가 최근 상태만 가볍게 확인하면 됩니다.",
        tone: "success" as const
      };
    }
    if (props.customerListFilter === "expiring") {
      return {
        title: "문제가 없어서 비어 있습니다.",
        body: "30일 안에 만료되는 인증서 고객이 없습니다. 지금은 급한 갱신 작업이 없는 상태입니다.",
        tone: "success" as const
      };
    }
    if (props.customerListFilter === "unjoined") {
      return {
        title: "문제가 없어서 비어 있습니다.",
        body: "팝빌 가입과 전자세금용 인증서 연결이 모두 끝났습니다. 첫 발행 준비가 이 단계에서는 막혀 있지 않습니다.",
        tone: "success" as const
      };
    }
    if (props.customerListFilter === "ready") {
      return {
        title: "아직 발행 가능한 고객이 없습니다.",
        body:
          props.blockedCustomerCount > 0
            ? "막힌 고객부터 열어 해결 버튼을 누르면 이 목록으로 이동합니다."
            : "고객은 있지만 아직 인증서 연결이나 준비가 덜 끝났을 수 있습니다.",
        tone: "warn" as const
      };
    }
    return {
      title: activeFilterCopy[props.customerListFilter].empty,
      body: "왼쪽 상단의 새 고객 등록 버튼으로 첫 고객을 만들어 주세요.",
      tone: "info" as const
    };
  })();
  const selectedCustomerPrimaryIssue =
    inlineCustomerIssue ?? stackedCustomerIssues.find((issue) => Boolean(issue.actionLabel)) ?? null;
  const selectedCustomerLeadMessage = selectedCustomerReadiness
    ? selectedCustomerReadiness.canIssueNow
      ? selectedCustomerReadiness.reason === "준비 완료"
        ? "지금 바로 발행할 수 있습니다."
        : `발행은 가능하지만 ${selectedCustomerReadiness.reason}을 먼저 확인하세요.`
      : `${selectedCustomerReadiness.reason} 때문에 지금은 발행이 막혀 있습니다.`
    : null;
  const customerRequiredFieldChecks = [
    { label: "대표자명", done: props.customerForm.customerName.trim() !== "" },
    { label: "사업자번호", done: props.customerForm.businessNumber.trim() !== "" },
    { label: "세금계산서 상호", done: props.customerForm.corpName.trim() !== "" },
    { label: "주소", done: props.customerForm.addr.trim() !== "" }
  ];
  const customerOptionalFieldChecks = [
    { label: "업태", done: props.customerForm.bizType.trim() !== "" },
    { label: "업종", done: props.customerForm.bizClass.trim() !== "" },
    { label: "고객 연락처", done: props.customerForm.renewalContactMobile.trim() !== "" },
    { label: "메모", done: props.customerForm.memo.trim() !== "" }
  ];
  const selectedCustomerGuide = (() => {
    if (!selectedCustomer || !selectedCustomerReadiness) return null;

    if (!selectedCustomerReadiness.canIssueNow) {
      switch (selectedCustomerPrimaryIssue?.actionKind) {
        case "join-popbill":
          return {
            reasonLabel: "왜 막혔는지",
            reasonValue: "팝빌 가입이 아직 없습니다.",
            reasonBody: "팝빌은 이 고객으로 실제 전자세금계산서를 발행할 계정입니다.",
            nextTitle: "팝빌 가입 버튼 누르기",
            nextBody: "가입이 끝나면 다음 단계인 전자세금용 인증서 등록으로 바로 이어집니다."
          };
        case "register-certificate":
          return {
            reasonLabel: "왜 막혔는지",
            reasonValue: "전자세금용 인증서가 아직 없습니다.",
            reasonBody: "전자세금용 공동인증서는 실제 발행 때 꼭 필요한 인증서입니다.",
            nextTitle: "전자세금용 인증서 등록",
            nextBody: "인증서 등록이 끝나면 이 고객은 곧바로 발행 가능 상태로 바뀝니다."
          };
        case "check-certificate":
          return {
            reasonLabel: "왜 막혔는지",
            reasonValue: "인증서 만료 또는 상태 확인이 필요합니다.",
            reasonBody: "인증서가 만료되면 발행이 바로 막히므로 먼저 현재 상태를 다시 읽어 와야 합니다.",
            nextTitle: "만료일 다시 확인",
            nextBody: "상태를 새로 읽은 뒤 인증서 관리에서 갱신 준비/결제 흐름을 이어가세요."
          };
        default:
          return {
            reasonLabel: "왜 막혔는지",
            reasonValue: selectedCustomerReadiness.reason,
            reasonBody: "위 체크리스트에서 막힌 이유와 해결 버튼을 한 번에 정리해 두었습니다.",
            nextTitle: "위 해결 버튼부터 진행",
            nextBody: "한 항목씩 해결하면 이 고객은 다시 발행 가능 상태로 돌아옵니다."
          };
      }
    }

    const days = getCustomerCertificateDays(selectedCustomer);
    if (days !== null && days <= 30) {
      return {
        reasonLabel: "지금 주의할 점",
        reasonValue: `인증서 만료 ${days}일 전`,
        reasonBody: "지금 발행은 가능하지만 만료 전 갱신 일정을 잡아 두면 운영 중 막힘을 줄일 수 있습니다.",
        nextTitle: "인증서 관리에서 일정 확인",
        nextBody: "인증서 관리 탭에서 준비/결제 상태를 확인하고 미리 갱신 흐름을 진행하세요."
      };
    }

    return {
      reasonLabel: "지금 상태",
      reasonValue: "필수 준비가 모두 끝났습니다.",
      reasonBody: "팝빌 가입과 전자세금용 인증서 등록이 끝나 있어 지금 바로 발행 가능한 상태입니다.",
      nextTitle: "오늘 작업에서 초안 확인",
      nextBody: "발행 대상 메일이 들어오면 오늘 작업 탭에서 초안 생성과 발행 여부를 바로 확인하면 됩니다."
    };
  })();
  const getCustomerIssueHelpText = (issue: CustomerIssueChecklistItem) => {
    switch (issue.actionKind) {
      case "join-popbill":
        return "팝빌 가입이 끝나야 이 고객 계정으로 전자세금계산서를 발행할 수 있습니다.";
      case "register-certificate":
        return "전자세금용 공동인증서를 팝빌에 등록해야 실제 발행이 가능합니다.";
      case "check-certificate":
        return "만료일과 현재 상태를 다시 읽어 오면 발행 가능 여부가 갱신됩니다.";
      default:
        return issue.tone === "success"
          ? "추가 조치 없이 바로 발행할 수 있는 상태입니다."
          : "이 항목을 해결하면 발행 준비 상태가 갱신됩니다.";
    }
  };

  const runSelectedCustomerIssueAction = (issue: CustomerIssueChecklistItem) => {
    if (!selectedCustomer || !issue.actionKind) return;

    switch (issue.actionKind) {
      case "join-popbill":
        return void props.runAction(`join-${selectedCustomer.id}`, async () => props.onJoinCustomerPopbill(selectedCustomer.id));
      case "register-certificate":
        return void props.runAction(
          `cert-url-${selectedCustomer.id}`,
          async () => props.onOpenCustomerCertRegistration(selectedCustomer.id),
          { reload: false }
        );
      case "check-certificate":
        return void props.runAction(
          `cert-status-${selectedCustomer.id}`,
          async () => props.onRefreshCustomerCertificateStatus(selectedCustomer.id)
        );
      default:
        return;
    }
  };

  return (
    <div className="customers-screen">
      {props.expiredCertCustomers.length > 0 ? (
        <div className="alert error">
          인증서 만료 고객 {props.expiredCertCustomers.length}건: {props.expiredCertCustomers.map((customer) => customer.customerName).join(", ")}
        </div>
      ) : null}
      {props.expiringSoonCustomers.length > 0 ? (
        <div className="alert warn">
          인증서 만료 예정 30일 이내 {props.expiringSoonCustomers.length}건: {props.expiringSoonCustomers
            .map((customer) => `${customer.customerName}(${props.formatCertificateExpireDate(customer.popbillCertExpireDate)})`)
            .join(", ")}
        </div>
      ) : null}
      <div className="customers-layout">
        <Panel
          className="panel-customer-list"
          title={activeFilterCopy[props.customerListFilter].title}
          subtitle={activeFilterCopy[props.customerListFilter].subtitle}
          actions={(
            <>
              <button
                className="btn-secondary"
                disabled={props.hasReachedManagedCustomerLimit}
                onClick={props.onCreateCustomer}
              >
                새 고객 등록
              </button>
              <button onClick={() => void props.runAction("customers-cert-refresh-all", props.onRefreshAllCertificateStatuses)}>인증서 일괄 점검</button>
            </>
          )}
        >
          <div className="customer-focus-grid" aria-label="고객 작업 바로가기">
            {queueCards.map((card) => (
              <button
                key={card.key}
                type="button"
                className={props.customerListFilter === card.key ? "customer-focus-card active" : "customer-focus-card"}
                onClick={() => focusCustomerList(card.key)}
              >
                <div className="customer-focus-head">
                  <span>{card.label}</span>
                  <span className={`chip ${card.tone === "danger" ? "chip-danger" : card.tone === "warn" ? "chip-warn" : "chip-success"}`}>
                    {card.count}명
                  </span>
                </div>
                <strong>{card.count.toLocaleString("ko-KR")}</strong>
                <p className="customer-focus-description">{card.description}</p>
              </button>
            ))}
          </div>
          <div className="customer-list-toolbar">
            <div className="customer-list-search">
              <input
                placeholder="대표자명 / 상호 / 사업자번호 검색"
                value={props.customerSearchQuery}
                onChange={(event) => props.setCustomerSearchQuery(event.target.value)}
              />
            </div>
            <div className="customer-list-filters">
              <button
                type="button"
                className={props.customerListFilter === "all" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("all")}
              >
                전체 {props.customers.length}명
              </button>
              <button
                type="button"
                className={props.customerListFilter === "blocked" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("blocked")}
              >
                막힌 고객 {props.blockedCustomerCount}명
              </button>
              <button
                type="button"
                className={props.customerListFilter === "ready" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("ready")}
              >
                발행 가능 {props.readyCustomerCount}명
              </button>
              <button
                type="button"
                className={props.customerListFilter === "expiring" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("expiring")}
              >
                만료 주의 {props.expiringSoonCustomerCount}명
              </button>
              <button
                type="button"
                className={props.customerListFilter === "unjoined" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerListFilter("unjoined")}
              >
                연결 마무리 {props.popbillPendingCustomerCount}명
              </button>
            </div>
          </div>
          <div className="customer-list-summary-line">
            <span>전체 {props.customers.length}명</span>
            <span>검색 결과 {props.filteredCustomers.length}명</span>
            <span>발행 가능 {props.readyCustomerCount}명</span>
            {props.customerSearchQuery.trim() !== "" ? <span>검색어 {props.customerSearchQuery.trim()}</span> : null}
          </div>
          <div className="customer-list-guide" aria-live="polite">
            <strong>{customerListGuide.title}</strong>
            <span>{customerListGuide.body}</span>
            <span className="customer-list-guide-glossary">{customerListGuide.glossary}</span>
          </div>
          {recentCustomers.length > 0 ? (
            <div className="customer-recent-strip" aria-label="최근 본 고객">
              <strong>최근 본 고객</strong>
              <div className="customer-recent-chips">
                {recentCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="btn-secondary"
                    onClick={() => props.onSelectCustomer(customer)}
                  >
                    {customer.customerName}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="helper-box customer-limit-box">
            <strong>관리 고객 한도</strong>
            <span>
              현재 {props.managedCustomerCount}명
              {props.managedCustomerLimit !== null ? ` / 한도 ${props.managedCustomerLimit}명` : ""}
              {props.hasReachedManagedCustomerLimit ? " · 한도에 도달해 새 고객 등록이 잠겨 있습니다." : ""}
            </span>
          </div>
          <div className="list">
            {props.filteredCustomers.map((customer) => {
              const readiness = props.getCustomerIssueReadiness(customer);
              const isSelected = props.customerForm.id === customer.id;
              const nextStep = getCustomerNextStep(customer);

              return (
                <button
                  key={customer.id}
                  type="button"
                  className={`customer-summary ${isSelected ? "selected" : ""} ${readiness.canIssueNow ? "customer-summary-ready" : "customer-summary-blocked"}`}
                  onClick={() => props.onSelectCustomer(customer)}
                >
                  <div className="customer-summary-head">
                    <div className="customer-summary-copy">
                      <strong>{customer.corpName}</strong>
                      <p>{customer.customerName}</p>
                    </div>
                    <span className={`chip ${readiness.tone === "success" ? "chip-success" : readiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>{readiness.label}</span>
                  </div>
                  <div className="customer-summary-meta">
                    <span>{customer.businessNumber}</span>
                    <span>{props.getCustomerPopbillSummary(customer)}</span>
                    <span>{props.getCustomerCertificateSummary(customer)}</span>
                  </div>
                  <p className="customer-summary-reason">{readiness.reason}</p>
                  <div className="customer-summary-next-step">
                    <span>다음 행동</span>
                    <strong>{nextStep.title}</strong>
                    <p>{nextStep.body}</p>
                  </div>
                  {isSelected || props.customerSearchQuery.trim() !== "" ? <p className="customer-summary-address">{customer.addr}</p> : null}
                </button>
              );
            })}
            {props.filteredCustomers.length === 0 ? (
              <div className={`context-empty-state ${customerListEmptyState.tone === "success" ? "tone-success" : customerListEmptyState.tone === "warn" ? "tone-warn" : "tone-info"}`}>
                <strong>{customerListEmptyState.title}</strong>
                <p>{customerListEmptyState.body}</p>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          className="panel-customer-editor"
          title={props.selectedCustomer ? `${props.selectedCustomer.customerName}` : "새 고객 등록"}
          subtitle={props.selectedCustomer ? "기본 정보와 상태" : "필수값 4개만 먼저 입력합니다."}
          actions={props.selectedCustomer && props.customerDetailTab === "info" ? (
            <button
              disabled={props.busyKey !== null}
              onClick={() => void props.runAction("save-customer-top", props.onSaveCustomer)}
            >
              {props.isSavingCustomer ? "고객 저장 중..." : "고객 저장"}
            </button>
          ) : null}
        >
          {selectedCustomer && selectedCustomerReadiness ? (
            <div className="customer-detail-top">
              <div className="customer-detail-copy">
                <strong>{selectedCustomer.corpName}</strong>
                <span>{selectedCustomer.customerName}</span>
              </div>
              <div className="customer-readiness-callout">
                <div className="customer-readiness-copy">
                  <span className={`chip ${selectedCustomerReadiness.tone === "success" ? "chip-success" : selectedCustomerReadiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>
                    {selectedCustomerReadiness.canIssueNow ? "발행 가능" : "발행 막힘"}
                  </span>
                  <strong>{selectedCustomerLeadMessage}</strong>
                  <p>
                    {selectedCustomerReadiness.canIssueNow
                      ? selectedCustomerReadiness.reason === "준비 완료"
                        ? "팝빌과 발행용 인증서 기준이 모두 갖춰진 상태입니다."
                        : "지금 발행은 가능하지만, 아래 이유를 먼저 확인하면 운영 중 예외를 줄일 수 있습니다."
                      : "왜 막혔는지와 바로 해결 버튼을 아래에서 한눈에 볼 수 있게 정리했습니다."}
                  </p>
                </div>
                {selectedCustomerPrimaryIssue?.actionLabel ? (
                  <button type="button" onClick={() => runSelectedCustomerIssueAction(selectedCustomerPrimaryIssue)}>
                    {selectedCustomerPrimaryIssue.actionLabel}
                  </button>
                ) : null}
              </div>
              {selectedCustomerGuide ? (
                <div className="customer-decision-grid" aria-label="고객 상태 빠른 요약">
                  <article className="customer-decision-card">
                    <span>발행 가능 여부</span>
                    <strong>{selectedCustomerReadiness.canIssueNow ? "지금 발행 가능" : "지금 발행 불가"}</strong>
                    <p>{selectedCustomerLeadMessage}</p>
                  </article>
                  <article className="customer-decision-card">
                    <span>{selectedCustomerGuide.reasonLabel}</span>
                    <strong>{selectedCustomerGuide.reasonValue}</strong>
                    <p>{selectedCustomerGuide.reasonBody}</p>
                  </article>
                  <article className="customer-decision-card">
                    <span>다음 행동</span>
                    <strong>{selectedCustomerGuide.nextTitle}</strong>
                    <p>{selectedCustomerGuide.nextBody}</p>
                  </article>
                </div>
              ) : null}
              <div className="customer-detail-stats">
                <div>
                  <span>발행 상태</span>
                  <strong>{selectedCustomerReadiness.label}</strong>
                </div>
                <div>
                  <span>팝빌</span>
                  <strong>{props.getCustomerPopbillSummary(selectedCustomer)}</strong>
                </div>
                <div>
                  <span>인증서</span>
                  <strong>{props.getCustomerCertificateSummary(selectedCustomer)}</strong>
                </div>
                <div>
                  <span>발행 방식</span>
                  <strong>{props.getIssueModeLabel(props.customerForm.issueMode)}</strong>
                </div>
              </div>
              <p className="customer-detail-address">{selectedCustomer.addr}</p>
              <div className="customer-detail-status-row">
                <span className={`chip ${selectedCustomerReadiness.tone === "success" ? "chip-success" : selectedCustomerReadiness.tone === "warn" ? "chip-warn" : "chip-danger"}`}>
                  {selectedCustomerReadiness.label}
                </span>
                {selectedCustomerReadiness.reason !== "준비 완료" ? <span className="customer-detail-status-note">{selectedCustomerReadiness.reason}</span> : null}
                {selectedCustomerPrimaryIssue?.actionLabel ? (
                  <button type="button" className="btn-secondary" onClick={() => runSelectedCustomerIssueAction(selectedCustomerPrimaryIssue)}>
                    {selectedCustomerPrimaryIssue.actionLabel}
                  </button>
                ) : null}
              </div>
              {stackedCustomerIssues.length > 0 ? (
                <div className="customer-issue-section">
                  <div className="customer-issue-section-head">
                    <strong>왜 막혔는지 / 바로 해결</strong>
                    <span>한 항목씩 해결하면 이 고객은 다시 발행 가능 상태로 돌아옵니다.</span>
                  </div>
                  <div className="customer-issue-list" aria-label="발행 준비 상태">
                  {stackedCustomerIssues.map((issue) => (
                    <article
                      key={issue.key}
                      className={
                        issue.tone === "danger"
                          ? "customer-issue-card tone-danger"
                          : issue.tone === "warn"
                            ? "customer-issue-card tone-warn"
                            : "customer-issue-card tone-success"
                      }
                    >
                      <div className="customer-issue-card-copy">
                        <span className={`chip ${issue.tone === "danger" ? "chip-danger" : issue.tone === "warn" ? "chip-warn" : "chip-success"}`}>
                          {issue.tone === "danger" ? "중요" : issue.tone === "warn" ? "점검" : "완료"}
                        </span>
                        <div className="customer-issue-text-block">
                          <span className="customer-issue-text">{issue.label}</span>
                          <span className="customer-issue-help">{getCustomerIssueHelpText(issue)}</span>
                        </div>
                      </div>
                      {issue.actionLabel ? (
                        <button type="button" className="btn-secondary" onClick={() => runSelectedCustomerIssueAction(issue)}>
                          {issue.actionLabel}
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
                </div>
              ) : null}
              {selectedCustomer.popbillState === "joined" &&
              selectedCustomer.popbillCertRegistered &&
              selectedCustomerReadiness.reason === "준비 완료" ? (
                <div className="customer-detail-actions">
                  <button
                    type="button"
                    onClick={() =>
                      void props.runAction(
                        `cert-url-${selectedCustomer.id}`,
                        async () => props.onOpenCustomerCertRegistration(selectedCustomer.id),
                        { reload: false }
                      )
                    }
                  >
                    인증서 재등록
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      void props.runAction(
                        `cert-status-${selectedCustomer.id}`,
                        async () => props.onRefreshCustomerCertificateStatus(selectedCustomer.id)
                      )
                    }
                  >
                    만료일 확인
                  </button>
                </div>
              ) : null}
              {props.customerCertNotice ? <div className="helper-box customer-cert-notice"><span>{props.customerCertNotice}</span></div> : null}
              <details className="customer-detail-secondary">
                <summary>더보기</summary>
                <div className="customer-detail-secondary-actions">
                  {selectedCustomer.popbillState === "joined" ? (
                    <button className="btn-ghost" onClick={() => void props.runAction(`reset-popbill-${selectedCustomer.id}`, async () => props.onResetPopbillLink(selectedCustomer))}>
                      연결 해제
                    </button>
                  ) : null}
                  <button className="btn-ghost btn-danger" onClick={() => void props.runAction(`delete-customer-${selectedCustomer.id}`, async () => props.onDeleteCustomer(selectedCustomer))}>
                    고객 삭제
                  </button>
                </div>
              </details>
            </div>
          ) : null}
          {props.selectedCustomer ? (
            <div className="customer-detail-tabs">
              <button
                type="button"
                className={props.customerDetailTab === "info" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerDetailTab("info")}
              >
                기본 정보
              </button>
              <button
                type="button"
                className={props.customerDetailTab === "history" ? "btn-secondary active-filter" : "btn-secondary"}
                onClick={() => props.setCustomerDetailTab("history")}
              >
                발행 이력 {props.selectedCustomerIssuedDrafts.length}건
              </button>
            </div>
          ) : null}

          {props.selectedCustomer && props.customerDetailTab === "history" ? (
            <div className="customer-history-list">
              {props.mailboxDataLoading && props.selectedCustomerIssuedDrafts.length === 0 ? (
                <div className="empty">발행 이력을 불러오는 중입니다.</div>
              ) : props.selectedCustomerIssuedDrafts.length > 0 ? (
                props.selectedCustomerIssuedDrafts.map((draft) => {
                  const confirmNumber = props.getDraftConfirmNumber(draft);
                  return (
                    <article key={draft.id} className="customer-history-card">
                      <div className="customer-history-head">
                        <div>
                          <strong>{draft.itemName}</strong>
                          <span>{props.formatDateTime(draft.issuedAt)}</span>
                        </div>
                        <span className="chip chip-success">발행 완료</span>
                      </div>
                      <div className="customer-history-meta">
                        <span>공급가액 {props.formatMoney(draft.supplyCost)}원</span>
                        <span>합계 {props.formatMoney(draft.totalAmount)}원</span>
                        <span>관리번호 {draft.popbillMgtKey || "-"}</span>
                        <span>승인번호 {confirmNumber ?? "-"}</span>
                      </div>
                      <div className="customer-history-actions">
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
                })
              ) : (
                <div className="empty">이 고객의 발행 이력이 없습니다.</div>
              )}
            </div>
          ) : (
            <form
              className="customer-form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                if (props.busyKey !== null) return;
                if (!props.selectedCustomer && props.hasReachedManagedCustomerLimit) return;
                void props.runAction(props.customerForm.id === null ? "save-customer" : `save-customer-${props.customerForm.id}`, props.onSaveCustomer);
              }}
            >
              {!props.selectedCustomer ? (
                <div className="customer-form-lead">
                  <strong>먼저 입력할 필수 4개</strong>
                  <span>대표자명, 사업자번호, 세금계산서 상호, 주소만 입력하면 저장할 수 있습니다. 나머지는 아래의 추가 입력에서 나중에 채워도 됩니다.</span>
                </div>
              ) : null}
              <div className="customer-form-scope-grid" aria-label="고객 정보 입력 범위">
                <article className="customer-form-scope-card">
                  <span>지금 꼭 입력</span>
                  <strong>
                    {customerRequiredFieldChecks.filter((field) => field.done).length}/{customerRequiredFieldChecks.length} 완료
                  </strong>
                  <p>
                    {customerRequiredFieldChecks.every((field) => field.done)
                      ? "대표자명, 사업자번호, 세금계산서 상호, 주소가 모두 준비됐습니다."
                      : `남은 항목: ${customerRequiredFieldChecks.filter((field) => !field.done).map((field) => field.label).join(", ")}`}
                  </p>
                </article>
                <article className="customer-form-scope-card optional">
                  <span>나중에 입력 가능</span>
                  <strong>
                    {customerOptionalFieldChecks.filter((field) => field.done).length}/{customerOptionalFieldChecks.length} 입력
                  </strong>
                  <p>
                    {customerOptionalFieldChecks.every((field) => field.done)
                      ? "업태, 업종, 고객 연락처, 메모까지 채워져 있어 운영 메모도 바로 확인할 수 있습니다."
                      : `업태, 업종, 고객 연락처, 메모는 저장 후 천천히 입력해도 됩니다.${customerOptionalFieldChecks.some((field) => !field.done) ? ` 아직 비어 있음: ${customerOptionalFieldChecks.filter((field) => !field.done).map((field) => field.label).join(", ")}` : ""}`}
                  </p>
                </article>
              </div>
              <div className="form-grid customer-form-primary-grid">
                <label>
                  대표자명
                  <input
                    ref={props.customerNameInputRef}
                    value={props.customerForm.customerName}
                    onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, customerName: event.target.value }))}
                  />
                </label>
                <label>
                  사업자번호
                  <input value={props.customerForm.businessNumber} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, businessNumber: event.target.value }))} />
                </label>
                <label>
                  세금계산서 상호
                  <input value={props.customerForm.corpName} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, corpName: event.target.value }))} />
                </label>
                <label className="full customer-form-address-field">
                  주소
                  <input
                    value={props.customerForm.addr}
                    onChange={(event) => {
                      const nextAddress = event.target.value;
                      props.customerAddressLookupRef.current = "";
                      props.setCustomerAddressResolveMessage("");
                      props.setCustomerForm((prev) => ({ ...prev, addr: nextAddress }));
                    }}
                    onBlur={() => void props.resolveCustomerAddress()}
                  />
                  <span className="field-hint">저장된 도로명주소와 같은 주소로 들어온 메일만 자동 매칭됩니다.</span>
                  {props.customerAddressResolveMessage ? <span className="field-hint">{props.customerAddressResolveMessage}</span> : null}
                </label>
              </div>
              <details className="customer-form-advanced">
                <summary>추가 입력 보기</summary>
                <div className="form-grid customer-form-advanced-grid">
                  <label>
                    업태
                    <input value={props.customerForm.bizType} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, bizType: event.target.value }))} />
                  </label>
                  <label>
                    업종
                    <input value={props.customerForm.bizClass} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, bizClass: event.target.value }))} />
                  </label>
                  <label>
                    고객 연락처
                    <input value={props.customerForm.renewalContactMobile} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, renewalContactMobile: event.target.value }))} placeholder="01012345678" />
                    <span className="field-hint">인증서 갱신 자동 제출에서 고객별 연락처로 사용합니다.</span>
                  </label>
                  <label className="full">
                    발행 방식
                    <select
                      value={props.customerForm.issueMode}
                      onChange={(event) =>
                        props.setCustomerForm((prev) => ({
                          ...prev,
                          issueMode:
                            prev.id === null ? "review" : event.target.value === "auto" ? "auto" : "review"
                        }))
                      }
                      disabled={props.customerForm.id === null}
                    >
                      <option value="review">검수 후 발행</option>
                      <option value="auto" disabled={props.customerForm.id === null}>월 자동 발행</option>
                    </select>
                    <span className="field-hint">
                      {props.customerForm.id === null
                        ? "처음 등록할 때는 먼저 검수 후 발행으로 저장됩니다. 저장 후 수정 화면에서 월 자동 발행으로 바꿀 수 있습니다."
                        : "자동 발행 고객은 작업공간 설정의 일정에 맞춰 메일 확인 뒤 바로 발행되고, 검수 고객은 초안만 만들어집니다."}
                    </span>
                  </label>
                  <label className="full">
                    메모
                    <textarea rows={3} value={props.customerForm.memo} onChange={(event) => props.setCustomerForm((prev) => ({ ...prev, memo: event.target.value }))} />
                  </label>
                </div>
              </details>
              {!props.selectedCustomer ? (
                <div className="button-row customer-form-submit-row">
                  <button type="submit" disabled={props.hasReachedManagedCustomerLimit || props.busyKey !== null}>
                    {props.isSavingCustomer ? "고객 등록 및 팝빌 가입 중..." : "고객 등록"}
                  </button>
                  {props.hasReachedManagedCustomerLimit ? (
                    <span className="field-hint">관리 고객 한도에 도달해 새 고객 등록이 잠겨 있습니다. 플랫폼 관리자에게 한도 상향을 요청하세요.</span>
                  ) : props.isSavingCustomer ? (
                    <span className="field-hint">고객 등록과 팝빌 가입을 처리하고 있습니다. 잠시만 기다려주세요.</span>
                  ) : null}
                </div>
              ) : null}
            </form>
          )}
        </Panel>
      </div>
    </div>
  );
}
