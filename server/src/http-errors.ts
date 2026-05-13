import { PopbillApiError } from "./popbill-client.js";
import { sanitizeSensitiveText } from "./utils.js";

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export type ApiErrorBody = {
  error: string;
  errorCode?: string;
  errorDetails?: string;
  errorOperation?: string;
};

function sanitizeExternalProviderText(value: string): string {
  return sanitizeSensitiveText(value)
    .replace(/팝빌\s*전자세금용\s*공동인증서/g, "전자세금용 공동인증서")
    .replace(/팝빌\s*전자세금용\s*인증서/g, "전자세금용 인증서")
    .replace(/팝빌\s*인증서/g, "전자세금용 인증서")
    .replace(/팝빌\s*가입/g, "발행 연동 준비")
    .replace(/팝빌\s*연동회원/g, "발행 연동 계정")
    .replace(/팝빌\s*회원/g, "발행 연동 계정")
    .replace(/팝빌\s*탈퇴/g, "발행 연동 해지")
    .replace(/팝빌\s*연동/g, "발행 연동")
    .replace(/팝빌/g, "외부 연동")
    .replace(/Popbill|POPBILL/g, "외부 연동");
}

export function buildApiErrorBody(error: unknown, fallbackMessage = "요청에 실패했습니다."): ApiErrorBody {
  if (error instanceof PopbillApiError) {
    return {
      error: sanitizeExternalProviderText(error.message),
      errorCode: error.code,
      errorDetails: error.rawMessage ? sanitizeExternalProviderText(error.rawMessage) : undefined,
      errorOperation: error.operation
    };
  }

  if (error instanceof HttpError) {
    return {
      error: sanitizeExternalProviderText(error.message)
    };
  }

  if (error instanceof Error) {
    return {
      error: sanitizeExternalProviderText(error.message)
    };
  }

  return {
    error: fallbackMessage
  };
}

export function getErrorStatus(error: unknown, fallbackStatus = 500): number {
  if (error instanceof PopbillApiError) {
    return error.status;
  }
  if (error instanceof HttpError) {
    return error.status;
  }
  if (error instanceof Error && typeof (error as Error & { status?: unknown }).status === "number") {
    return (error as Error & { status: number }).status;
  }
  return fallbackStatus;
}

export function getErrorMessage(error: unknown, fallbackMessage = "작업에 실패했습니다."): string {
  return buildApiErrorBody(error, fallbackMessage).error;
}
