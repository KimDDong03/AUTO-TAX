import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

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
  notificationEmails: string[];
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
  if (!input.smtpHost || !input.smtpFromEmail) {
    throw new Error("SMTP 설정이 비어 있습니다.");
  }

  let imapOk = false;
  let smtpOk = false;
  let testMailSent = false;
  let imapMessage = "IMAP 연결을 확인하지 못했습니다.";
  let smtpMessage = "SMTP 연결을 확인하지 못했습니다.";

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

  try {
    const transporter = nodemailer.createTransport({
      host: input.smtpHost,
      port: input.smtpPort,
      secure: input.smtpSecure,
      auth: input.smtpUser ? { user: input.smtpUser, pass: input.smtpPass } : undefined
    });

    await transporter.verify();
    smtpOk = true;

    if (input.notificationEmails.length > 0) {
      await transporter.sendMail({
        from: input.smtpFromName
          ? `"${input.smtpFromName}" <${input.smtpFromEmail}>`
          : input.smtpFromEmail,
        to: input.notificationEmails.join(", "),
        subject: "[AUTO-TAX] 메일 연결 테스트",
        text: "AUTO-TAX 메일 연결 테스트 메일입니다.\nIMAP/SMTP 인증이 정상 동작합니다."
      });
      testMailSent = true;
      smtpMessage = `SMTP 연결 성공, 테스트 메일 ${input.notificationEmails.length}곳 발송`;
    } else {
      smtpMessage = "SMTP 연결 성공, 알림 수신 메일이 없어 테스트 메일은 보내지 않았습니다.";
    }
  } catch (error) {
    smtpMessage = error instanceof Error ? error.message : "SMTP 연결 실패";
  }

  return {
    imapOk,
    imapMessage,
    smtpOk,
    smtpMessage,
    testMailSent
  };
}
