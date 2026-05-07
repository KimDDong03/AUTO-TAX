import type { Request, RequestHandler, Response } from "express";
import { HttpError } from "./http-errors.js";
import { isOrganizationOwnerRole, isWorkspaceEditorRole } from "./access-policy.js";
import { buildPilotLogContext } from "./pilot-issuance.js";
import type { ActiveOrganizationSession } from "./route-types.js";
import type { AppStore } from "./store-contract.js";
import type { AuthenticatedAppSession } from "./supabase.js";

export type RequestLocals = {
  authContext?: AuthenticatedAppSession;
  requestStore?: AppStore;
};

export function readAccessToken(req: Request): string | null {
  const authorization = req.header("authorization")?.trim();
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function isAnonymousApiPath(req: Request): boolean {
  return (
    req.method === "OPTIONS" ||
    req.path === "/health" ||
    req.path === "/public/login" ||
    req.path === "/public/signup" ||
    req.path === "/public/consultation-requests"
  );
}

export function isInternalJobApiPath(req: Request): boolean {
  return (
    req.path === "/internal/jobs/dispatch" ||
    req.path === "/internal/jobs/maintenance" ||
    req.path === "/internal/jobs/run"
  );
}

export function isRenewalAgentApiPath(req: Request): boolean {
  return (
    req.path === "/automation/renewal-agent/heartbeat" ||
    req.path === "/automation/renewal-agent/jobs/claim" ||
    /^\/automation\/renewal-agent\/jobs\/\d+\/(complete|fail)$/.test(req.path)
  );
}

export function setRequestLocals(res: Response, authContext: AuthenticatedAppSession, requestStore?: AppStore): void {
  const locals = res.locals as RequestLocals;
  locals.authContext = authContext;
  locals.requestStore = requestStore;
}

export function getLoggingStore(res: Response, fallbackStore?: AppStore | null): AppStore | null {
  const locals = res.locals as RequestLocals;
  return locals.requestStore ?? fallbackStore ?? null;
}

export function getRequestStore(res: Response, _fallbackStore?: AppStore | null): AppStore {
  const locals = res.locals as RequestLocals;
  if (!locals.requestStore) {
    throw new HttpError(403, "선택된 고객사 작업공간이 없습니다.");
  }
  return locals.requestStore;
}

export function requireAuthContext(res: Response): AuthenticatedAppSession {
  const locals = res.locals as RequestLocals;
  if (!locals.authContext) {
    throw new Error("로그인 정보가 없습니다.");
  }
  return locals.authContext;
}

export function requirePlatformAdmin(res: Response): AuthenticatedAppSession {
  const authContext = requireAuthContext(res);
  if (!authContext.isPlatformAdmin) {
    throw new HttpError(403, "플랫폼 관리자 전용 페이지입니다.");
  }
  return authContext;
}

function requireActiveOrganization(res: Response): ActiveOrganizationSession {
  const authContext = requireAuthContext(res);
  if (!authContext.activeOrganizationId || !authContext.activeOrganizationRole) {
    throw new HttpError(403, "선택된 고객사 작업공간이 없습니다.");
  }
  return authContext as ActiveOrganizationSession;
}

export function requireOrganizationOwner(res: Response): ActiveOrganizationSession {
  const authContext = requireActiveOrganization(res);
  if (!isOrganizationOwnerRole(authContext.activeOrganizationRole)) {
    throw new HttpError(403, "소유자만 사용자 관리를 할 수 있습니다.");
  }
  return authContext;
}

export function requireWorkspaceEditor(res: Response): ActiveOrganizationSession {
  const authContext = requireActiveOrganization(res);
  if (!isWorkspaceEditorRole(authContext.activeOrganizationRole)) {
    throw new HttpError(403, "이 작업은 작업공간 멤버만 실행할 수 있습니다.");
  }
  return authContext;
}

export function createInternalJobAccessGuard(deps: {
  hasValidJobSecret: (req: Request) => boolean;
}): (req: Request, res: Response) => "secret" | "ops" {
  return (req, res) => {
    if (deps.hasValidJobSecret(req)) {
      return "secret";
    }

    requirePlatformAdmin(res);
    return "ops";
  };
}

export function createRenewalAgentAccessGuard(deps: {
  hasValidRenewalAgentSecret: (req: Request) => boolean;
}): (req: Request) => void {
  return (req) => {
    if (!deps.hasValidRenewalAgentSecret(req)) {
      throw new HttpError(401, "로컬 인증서 에이전트 인증에 실패했습니다.");
    }
  };
}

type ApiAuthMiddlewareDeps = {
  hasValidJobSecret: (req: Request) => boolean;
  hasValidRenewalAgentSecret: (req: Request) => boolean;
  resolveAuthenticatedAppSession: (
    accessToken: string,
    organizationIdHeader: string | undefined
  ) => Promise<AuthenticatedAppSession>;
  createRequestStore: (authContext: AuthenticatedAppSession) => Promise<AppStore>;
  createLoggingStoreForOrganizationId?: (options: {
    organizationId: string;
    actorUserId?: string | null;
  }) => Promise<AppStore | null>;
};

export function createApiAuthMiddleware(deps: ApiAuthMiddlewareDeps): RequestHandler {
  return async (req, res, next) => {
    const logAuthFailure = async (status: number, message: string, actorUserId?: string | null) => {
      const organizationId = req.header("x-organization-id")?.trim();
      if (!organizationId || !deps.createLoggingStoreForOrganizationId) {
        return;
      }

      try {
        const loggingStore = await deps.createLoggingStoreForOrganizationId({
          organizationId,
          actorUserId
        });
        await loggingStore?.createLog(
          "warn",
          "api",
          "API 인증/세션 확인에 실패했습니다.",
          buildPilotLogContext(
            {
              method: req.method,
              path: req.path,
              error: message
            },
            {
              status,
              errorCategory: "auth/session"
            }
          )
        );
      } catch {
        // ignore auth logging failures to preserve the original response path
      }
    };

    if (isInternalJobApiPath(req) && deps.hasValidJobSecret(req)) {
      next();
      return;
    }

    if (isRenewalAgentApiPath(req)) {
      if (deps.hasValidRenewalAgentSecret(req)) {
        next();
        return;
      }

      res.status(401).json({ error: "로컬 인증서 에이전트 인증에 실패했습니다." });
      return;
    }

    if (isAnonymousApiPath(req)) {
      next();
      return;
    }

    const accessToken = readAccessToken(req);
    if (!accessToken) {
      await logAuthFailure(401, "로그인이 필요합니다.");
      res.status(401).json({ error: "로그인이 필요합니다." });
      return;
    }

    let authContext: AuthenticatedAppSession;

    try {
      authContext = await deps.resolveAuthenticatedAppSession(accessToken, req.header("x-organization-id"));
    } catch (error) {
      if (error instanceof HttpError) {
        await logAuthFailure(error.status, error.message);
        res.status(error.status).json({ error: error.message });
        return;
      }

      await logAuthFailure(401, "로그인 확인에 실패했습니다.");
      res.status(401).json({ error: "로그인 확인에 실패했습니다." });
      return;
    }

    try {
      if (authContext.activeOrganizationId) {
        const requestStore = await deps.createRequestStore(authContext);
        setRequestLocals(res, authContext, requestStore);
      } else {
        setRequestLocals(res, authContext);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
