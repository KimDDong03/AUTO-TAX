import { ImapFlow } from "imapflow";

export interface MailTestInput {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
  imapMailbox: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFromName: string;
  smtpFromEmail: string;
}

export interface MailTestResult {
  imapOk: boolean;
  imapMessage: string;
  smtpOk: boolean;
  smtpMessage: string;
  testMailSent: boolean;
}

export async function testMailConnections(input: MailTestInput): Promise<MailTestResult> {
  if (!input.imapHost || !input.imapUser || !input.imapPass) {
    throw new Error("IMAP 계정/비밀번호가 비어 있습니다.");
  }

  let imapOk = false;
  const smtpOk = true;
  const testMailSent = false;
  let imapMessage = "IMAP 연결을 확인하지 못했습니다.";
  const smtpMessage = "이메일 업무 알림은 사용하지 않습니다.";

  const imapClient = new ImapFlow({
    host: input.imapHost,
    port: input.imapPort,
    secure: input.imapSecure,
    auth: {
      user: input.imapUser,
      pass: input.imapPass
    }
  });

  try {
    await imapClient.connect();
    await imapClient.mailboxOpen(input.imapMailbox || "INBOX");
    imapOk = true;
    imapMessage = `IMAP 연결 성공 (${input.imapMailbox || "INBOX"})`;
  } catch (error) {
    imapMessage = error instanceof Error ? error.message : "IMAP 연결 실패";
  } finally {
    if (imapClient.usable) {
      await imapClient.logout().catch(() => undefined);
    }
  }

  return {
    imapOk,
    imapMessage,
    smtpOk,
    smtpMessage,
    testMailSent
  };
}
