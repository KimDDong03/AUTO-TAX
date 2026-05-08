import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decryptSecretWithMaterial,
  encryptSecretWithMaterial,
  isEncryptedSecret
} from "../server/src/secret-box.js";

type RotationColumn = {
  table: string;
  idColumn: string;
  column: string;
};

type RotationMode = "dry-run" | "apply";

type RotationValueResult =
  | { action: "empty"; nextValue: string }
  | { action: "rotate"; nextValue: string }
  | { action: "already-current"; nextValue: string };

export const SECRET_ROTATION_COLUMNS: RotationColumn[] = [
  { table: "organization_integrations", idColumn: "organization_id", column: "imap_pass_encrypted" },
  { table: "organization_integrations", idColumn: "organization_id", column: "smtp_pass_encrypted" },
  { table: "organization_integrations", idColumn: "organization_id", column: "popbill_secret_key_encrypted" },
  { table: "organization_integrations", idColumn: "organization_id", column: "popbill_shared_password_encrypted" },
  { table: "organization_integrations", idColumn: "organization_id", column: "renewal_certificate_password_encrypted" },
  { table: "organization_integrations", idColumn: "organization_id", column: "renewal_issue_password_encrypted" },
  { table: "managed_customers", idColumn: "id", column: "popbill_password_encrypted" },
  { table: "customer_certificates", idColumn: "id", column: "certificate_password_encrypted" }
];

function envString(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function requireEnv(name: string): string {
  const value = envString(name);
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }

  return value;
}

export function rotateSecretValue(value: unknown, oldKey: string, newKey: string): RotationValueResult {
  const raw = typeof value === "string" ? value : "";
  if (!raw) {
    return { action: "empty", nextValue: "" };
  }

  if (isEncryptedSecret(raw)) {
    try {
      const decryptedWithNewKey = decryptSecretWithMaterial(raw, newKey);
      return {
        action: "already-current",
        nextValue: raw
      };
    } catch {
      // Continue with the old key below.
    }
  }

  const plain = decryptSecretWithMaterial(raw, oldKey);
  return {
    action: "rotate",
    nextValue: encryptSecretWithMaterial(plain, newKey)
  };
}

async function rotateColumn(
  client: SupabaseClient,
  spec: RotationColumn,
  oldKey: string,
  newKey: string,
  mode: RotationMode
): Promise<{ scanned: number; rotated: number; alreadyCurrent: number; empty: number }> {
  const selectColumns = `${spec.idColumn},${spec.column}`;
  const { data, error } = await client.from(spec.table).select(selectColumns);
  if (error) {
    throw new Error(`${spec.table}.${spec.column} 조회 실패: ${error.message}`);
  }

  let rotated = 0;
  let alreadyCurrent = 0;
  let empty = 0;

  for (const row of data ?? []) {
    const rowId = (row as Record<string, unknown>)[spec.idColumn];
    const currentValue = (row as Record<string, unknown>)[spec.column];
    const result = rotateSecretValue(currentValue, oldKey, newKey);

    if (result.action === "empty") {
      empty += 1;
      continue;
    }
    if (result.action === "already-current") {
      alreadyCurrent += 1;
      continue;
    }

    rotated += 1;
    if (mode === "apply") {
      const { error: updateError } = await client
        .from(spec.table)
        .update({ [spec.column]: result.nextValue })
        .eq(spec.idColumn, rowId);
      if (updateError) {
        throw new Error(`${spec.table}.${spec.column} 업데이트 실패: ${updateError.message}`);
      }
    }
  }

  return {
    scanned: data?.length ?? 0,
    rotated,
    alreadyCurrent,
    empty
  };
}

function parseMode(argv: string[]): RotationMode {
  if (argv.includes("--apply")) {
    return "apply";
  }

  return "dry-run";
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const oldKey = envString("AUTO_TAX_OLD_ENCRYPTION_KEY") || serviceRoleKey;
  const newKey = requireEnv("AUTO_TAX_NEW_ENCRYPTION_KEY");

  if (oldKey === newKey) {
    throw new Error("AUTO_TAX_OLD_ENCRYPTION_KEY 와 AUTO_TAX_NEW_ENCRYPTION_KEY 값이 같으면 rotation 할 수 없습니다.");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log(`[secret-rotation] mode=${mode}`);
  console.log("[secret-rotation] oldKeySource=AUTO_TAX_OLD_ENCRYPTION_KEY || SUPABASE_SERVICE_ROLE_KEY");
  console.log("[secret-rotation] targetColumns=" + SECRET_ROTATION_COLUMNS.length);

  let totalScanned = 0;
  let totalRotated = 0;
  let totalAlreadyCurrent = 0;
  let totalEmpty = 0;

  for (const spec of SECRET_ROTATION_COLUMNS) {
    const result = await rotateColumn(client, spec, oldKey, newKey, mode);
    totalScanned += result.scanned;
    totalRotated += result.rotated;
    totalAlreadyCurrent += result.alreadyCurrent;
    totalEmpty += result.empty;
    console.log(
      `[secret-rotation] ${spec.table}.${spec.column} scanned=${result.scanned} rotate=${result.rotated} alreadyCurrent=${result.alreadyCurrent} empty=${result.empty}`
    );
  }

  console.log(
    `[secret-rotation] done scanned=${totalScanned} rotate=${totalRotated} alreadyCurrent=${totalAlreadyCurrent} empty=${totalEmpty}`
  );

  if (mode === "dry-run") {
    console.log("[secret-rotation] dry-run only. Re-run with --apply to update encrypted values.");
  }
}

function isMainModule(): boolean {
  const scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
  return scriptPath === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
