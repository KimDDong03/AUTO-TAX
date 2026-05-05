type JobApiPayload = {
  ok?: boolean;
  [key: string]: unknown;
};

const DEFAULT_RUN_LIMIT = 10;
const MAX_RUN_LIMIT = 25;

function toErrorPayload(error: unknown): JobApiPayload {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "internal job call failed"
  };
}

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} 시크릿이 설정되지 않았습니다.`);
  }
  return value;
}

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

function hasValidTickSecret(req: Request): boolean {
  const expected = env("AUTO_TAX_JOB_SECRET");
  const headerValue = req.headers.get("x-auto-tax-job-secret")?.trim();
  return Boolean(headerValue) && headerValue === expected;
}

function getServerUrl(): string {
  const value = env("AUTO_TAX_SERVER_URL").replace(/\/+$/, "");
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

async function callInternalJobApi(pathname: string, body?: Record<string, unknown>): Promise<JobApiPayload> {
  const serverUrl = getServerUrl();
  const jobSecret = env("AUTO_TAX_JOB_SECRET");
  const url = new URL(pathname, serverUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-auto-tax-job-secret": jobSecret
    },
    body: body ? JSON.stringify(body) : "{}"
  });

  let payload: JobApiPayload | null = null;
  try {
    payload = (await response.json()) as JobApiPayload;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error ? String(payload.error) : `${pathname} 호출이 실패했습니다. status=${response.status}`);
  }

  return payload ?? {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type, x-auto-tax-job-secret"
      }
    });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, {
      ok: false,
      error: "POST 또는 GET만 허용됩니다."
    });
  }

  if (!hasValidTickSecret(req)) {
    return json(401, {
      ok: false,
      error: "유효한 작업 시크릿이 필요합니다."
    });
  }

  try {
    let limit = DEFAULT_RUN_LIMIT;
    if (req.method === "POST") {
      try {
        const payload = (await req.json()) as { limit?: unknown };
        if (typeof payload.limit === "number" && Number.isFinite(payload.limit)) {
          limit = Math.max(1, Math.min(Math.trunc(payload.limit), MAX_RUN_LIMIT));
        }
      } catch {
        // empty body is acceptable
      }
    }

    let maintenance: JobApiPayload;
    try {
      maintenance = await callInternalJobApi("/api/internal/jobs/maintenance");
    } catch (error) {
      maintenance = toErrorPayload(error);
    }

    const dispatch = await callInternalJobApi("/api/internal/jobs/dispatch");
    const run = await callInternalJobApi("/api/internal/jobs/run", { limit });

    return json(200, {
      ok: true,
      maintenance,
      dispatch,
      run
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "job-tick 실행 실패"
    });
  }
});
