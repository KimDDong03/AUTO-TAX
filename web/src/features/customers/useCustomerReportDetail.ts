import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";
import type { CustomerReportDetail } from "../../types";
import {
  createEmptyCustomerReportDetail,
  normalizeCustomerReportDetail,
  toCustomerReportDetailInput
} from "./customerReportDetail";

export function useCustomerReportDetail(customerId: number | null, reportYear: number) {
  const [detail, setDetail] = useState<CustomerReportDetail | null>(null);
  const [draft, setDraft] = useState<CustomerReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loadTokenRef = useRef(0);

  const load = useCallback(async () => {
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    setNotice("");

    if (customerId === null) {
      setDetail(null);
      setDraft(null);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    const emptyDetail = createEmptyCustomerReportDetail(customerId, reportYear);
    setDetail(emptyDetail);
    setDraft(emptyDetail);
    try {
      const payload = await api<CustomerReportDetail>(
        `/api/customers/${customerId}/report-detail?year=${encodeURIComponent(String(reportYear))}`
      );
      if (loadTokenRef.current !== token) {
        return;
      }
      const normalized = normalizeCustomerReportDetail(payload);
      setDetail(normalized);
      setDraft(normalized);
    } catch (loadError) {
      if (loadTokenRef.current !== token) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "신고 상세를 불러오지 못했습니다.");
      setDetail(emptyDetail);
      setDraft(emptyDetail);
    } finally {
      if (loadTokenRef.current === token) {
        setLoading(false);
      }
    }
  }, [customerId, reportYear]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!draft || customerId === null) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await api<CustomerReportDetail>(`/api/customers/${customerId}/report-detail`, {
        method: "PUT",
        body: JSON.stringify(toCustomerReportDetailInput(draft))
      });
      const normalized = normalizeCustomerReportDetail(payload);
      setDetail(normalized);
      setDraft(normalized);
      setNotice("신고 상세를 저장했습니다.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "신고 상세를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }, [customerId, draft]);

  return {
    detail,
    draft,
    setDraft,
    loading,
    saving,
    error,
    notice,
    reload: load,
    save
  };
}
