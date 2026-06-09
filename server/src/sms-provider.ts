import { SolapiMessageService } from "solapi";

export type SmsSendInput = {
  to: string;
  text: string;
};

export type SmsSendResult = {
  provider: "dev" | "solapi";
  providerMessageId?: string;
  devCode?: string;
};

export type SmsProvider = {
  readonly provider: "dev" | "solapi";
  send(input: SmsSendInput): Promise<SmsSendResult>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readSolapiMessageId(response: unknown): string | undefined {
  const responseRecord = asRecord(response);
  if (!responseRecord) {
    return undefined;
  }

  const messageList = responseRecord.messageList;
  if (Array.isArray(messageList)) {
    const firstMessage = asRecord(messageList[0]);
    const messageId = firstMessage?.messageId;
    return typeof messageId === "string" ? messageId : undefined;
  }

  return undefined;
}

function normalizeSmsPhone(value: string): string {
  return value.replace(/\D/g, "");
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function createSmsProvider(): SmsProvider {
  if (process.env.SMS_PROVIDER === "solapi") {
    const apiKey = process.env.SOLAPI_API_KEY?.trim();
    const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
    const senderNumber = normalizeSmsPhone(process.env.SOLAPI_SENDER_NUMBER ?? "");

    if (!apiKey || !apiSecret || !senderNumber) {
      throw new Error("SOLAPI 문자 발송 설정이 없습니다. SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_NUMBER를 확인하세요.");
    }

    const messageService = new SolapiMessageService(apiKey, apiSecret);
    return {
      provider: "solapi",
      async send(input) {
        const response = await messageService.send({
          to: normalizeSmsPhone(input.to),
          from: senderNumber,
          text: input.text
        });
        return {
          provider: "solapi",
          providerMessageId: readSolapiMessageId(response)
        };
      }
    };
  }

  if (isProductionRuntime()) {
    throw new Error("운영 환경에서는 개발용 문자 인증 provider를 사용할 수 없습니다. SMS_PROVIDER=solapi 설정을 확인하세요.");
  }

  return {
    provider: "dev",
    async send(input) {
      const codeMatch = input.text.match(/\b(\d{6})\b/);
      console.info(`[dev-sms] ${input.to}: ${input.text}`);
      return {
        provider: "dev",
        devCode: codeMatch?.[1]
      };
    }
  };
}
