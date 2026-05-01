import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { api } from "../../api";
import type { CustomerReportDetail } from "../../types";
import {
  createEmptyCustomerReportDetail,
  normalizeCustomerReportDetail,
  toCustomerReportDetailInput
} from "./customerReportDetail";

type UseCustomerReportDetailOptions = {
  onSaved?: (detail: CustomerReportDetail) => void | Promise<void>;
};

function getReportDetailSignature(detail: CustomerReportDetail | null): string {
  return detail ? JSON.stringify(toCustomerReportDetailInput(detail)) : "";
}

export function useCustomerReportDetail(
  customerId: number | null,
  reportYear: number,
  options: UseCustomerReportDetailOptions = {}
) {
  const [detail, setDetail] = useState<CustomerReportDetail | null>(null);
  const [draft, setDraft] = useState<CustomerReportDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loadTokenRef = useRef(0);
  const saveTokenRef = useRef(0);
  const latestDraftRef = useRef<CustomerReportDetail | null>(null);
  const latestDraftSignatureRef = useRef("");
  const onSavedRef = useRef(options.onSaved);

  useEffect(() => {
    onSavedRef.current = options.onSaved;
  }, [options.onSaved]);

  const setTrackedDraft = useCallback((value: SetStateAction<CustomerReportDetail | null>) => {
    setDraft((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      latestDraftRef.current = next;
      latestDraftSignatureRef.current = getReportDetailSignature(next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    const token = loadTokenRef.current + 1;
    loadTokenRef.current = token;
    setNotice("");

    if (customerId === null) {
      setDetail(null);
      setTrackedDraft(null);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    const emptyDetail = createEmptyCustomerReportDetail(customerId, reportYear);
    setDetail(emptyDetail);
    setTrackedDraft(emptyDetail);
    try {
      const payload = await api<CustomerReportDetail>(
        `/api/customers/${customerId}/report-detail?year=${encodeURIComponent(String(reportYear))}`
      );
      if (loadTokenRef.current !== token) {
        return;
      }
      const normalized = normalizeCustomerReportDetail(payload);
      setDetail(normalized);
      setTrackedDraft(normalized);
    } catch (loadError) {
      if (loadTokenRef.current !== token) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "신고 상세를 불러오지 못했습니다.");
      setDetail(emptyDetail);
      setTrackedDraft(emptyDetail);
    } finally {
      if (loadTokenRef.current === token) {
        setLoading(false);
      }
    }
  }, [customerId, reportYear, setTrackedDraft]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    latestDraftSignatureRef.current = getReportDetailSignature(draft);
  }, [draft]);

  const saveCurrentDraft = useCallback(
    async (currentDraft: CustomerReportDetail, successNotice: string) => {
      if (customerId === null) {
        return;
      }

      const token = saveTokenRef.current + 1;
      saveTokenRef.current = token;
      const savedSignature = getReportDetailSignature(currentDraft);

      setSaving(true);
      setError("");
      setNotice("");
      try {
        const payload = await api<CustomerReportDetail>(`/api/customers/${customerId}/report-detail`, {
          method: "PUT",
          body: JSON.stringify(toCustomerReportDetailInput(currentDraft))
        });
        const normalized = normalizeCustomerReportDetail(payload);
        if (saveTokenRef.current !== token) {
          return;
        }
        setDetail(normalized);
        if (latestDraftSignatureRef.current === savedSignature) {
          setTrackedDraft(normalized);
        }
        setNotice(successNotice);
        await onSavedRef.current?.(normalized);
      } catch (saveError) {
        if (saveTokenRef.current !== token) {
          return;
        }
        setError(saveError instanceof Error ? saveError.message : "신고 상세를 저장하지 못했습니다.");
      } finally {
        if (saveTokenRef.current === token) {
          setSaving(false);
        }
      }
    },
    [customerId, setTrackedDraft]
  );

  useEffect(() => {
    if (!draft || !detail || customerId === null || loading || saving) {
      return;
    }

    if (getReportDetailSignature(draft) === getReportDetailSignature(detail)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveCurrentDraft(draft, "자동 저장되었습니다.");
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [customerId, detail, draft, loading, saveCurrentDraft, saving]);

  const save = useCallback(async () => {
    const currentDraft = latestDraftRef.current;
    if (!currentDraft || customerId === null) {
      return;
    }
    await saveCurrentDraft(currentDraft, "신고 상세를 저장했습니다.");
  }, [customerId, saveCurrentDraft]);

  return {
    detail,
    draft,
    setDraft: setTrackedDraft,
    loading,
    saving,
    error,
    notice,
    reload: load,
    save
  };
}
