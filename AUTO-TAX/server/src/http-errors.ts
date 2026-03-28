import { PopbillApiError } from "./popbill-client.js";

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

export function buildApiErrorBody(error: unknown, fallbackMessage = "요청에 실패했습니다."): ApiErrorBody {
  if (error instanceof PopbillApiError) {
    return {
      error: error.message,
      errorCode: error.code,
      errorDetails: error.rawMessage,
      errorOperation: error.operation
    };
  }

  if (error instanceof HttpError) {
    return {
      error: error.message
    };
  }

  if (error instanceof Error) {
    return {
      error: error.message
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
