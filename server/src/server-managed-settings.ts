import type { AppSettings } from "./domain.js";
import type { AppStore } from "./store-contract.js";
import { normalizePopbillUserPrefix } from "./utils.js";

function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function requiredEnvString(name: string): string {
  const value = envString(name);
  if (!value) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }
  return value;
}

function envBool(name: string): boolean | undefined {
  const value = envString(name)?.toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}

export function applyServerManagedSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    popbillLinkId: envString("AUTO_TAX_POPBILL_LINK_ID") ?? settings.popbillLinkId,
    popbillSecretKey: envString("AUTO_TAX_POPBILL_SECRET_KEY") ?? settings.popbillSecretKey,
    popbillIsTest: envBool("AUTO_TAX_POPBILL_IS_TEST") ?? settings.popbillIsTest,
    popbillPartnerCorpNum: envString("AUTO_TAX_POPBILL_PARTNER_CORP_NUM") ?? settings.popbillPartnerCorpNum,
    popbillUserIdPrefix:
      envString("AUTO_TAX_POPBILL_USER_ID_PREFIX") !== undefined
        ? normalizePopbillUserPrefix(envString("AUTO_TAX_POPBILL_USER_ID_PREFIX") ?? "")
        : settings.popbillUserIdPrefix,
    popbillSharedPassword:
      envString("AUTO_TAX_POPBILL_SHARED_PASSWORD") ?? settings.popbillSharedPassword
  };
}

export function getRequiredServerManagedPopbillCustomerDefaults(): Pick<
  AppSettings,
  "popbillUserIdPrefix" | "popbillSharedPassword"
> {
  return {
    popbillUserIdPrefix: normalizePopbillUserPrefix(requiredEnvString("AUTO_TAX_POPBILL_USER_ID_PREFIX")),
    popbillSharedPassword: requiredEnvString("AUTO_TAX_POPBILL_SHARED_PASSWORD")
  };
}

export async function getServerManagedSettings(store: AppStore): Promise<AppSettings> {
  return applyServerManagedSettings(await store.getSettings());
}
