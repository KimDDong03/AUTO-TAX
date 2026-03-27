import type { AppSettings } from "./domain.js";
import type { AppStore } from "./store-contract.js";

function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
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
    popbillPartnerCorpNum: envString("AUTO_TAX_POPBILL_PARTNER_CORP_NUM") ?? settings.popbillPartnerCorpNum
  };
}

export async function getServerManagedSettings(store: AppStore): Promise<AppSettings> {
  return applyServerManagedSettings(await store.getSettings());
}
