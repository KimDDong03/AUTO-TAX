import nodemailer from "nodemailer";

export interface SupportRequestInput {
  companyName: string;
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  message: string;
  userAgent?: string | null;
}

const DEFAULT_SUPPORT_EMAIL = "ehdrjs0887@gmail.com";

function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = envString(name)?.toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

export async function sendSupportRequest(input: SupportRequestInput): Promise<void> {
  const toEmail = envString("AUTO_TAX_SUPPORT_TO_EMAIL") ?? DEFAULT_SUPPORT_EMAIL;
  const fromEmail = envString("AUTO_TAX_SUPPORT_FROM_EMAIL") ?? toEmail;
  const smtpPassword = envString("AUTO_TAX_SUPPORT_APP_PASSWORD");

  if (!smtpPassword) {
    throw new Error("문의 메일 발송 설정이 아직 준비되지 않았습니다. AUTO_TAX_SUPPORT_APP_PASSWORD를 먼저 넣어주세요.");
  }

  const transporter = nodemailer.createTransport({
    host: envString("AUTO_TAX_SUPPORT_SMTP_HOST") ?? "smtp.gmail.com",
    port: Number(envString("AUTO_TAX_SUPPORT_SMTP_PORT") ?? "465"),
    secure: envBool("AUTO_TAX_SUPPORT_SMTP_SECURE", true),
    auth: {
      user: fromEmail,
      pass: smtpPassword
    }
  });

  await transporter.sendMail({
    from: `"AUTO-TAX 문의" <${fromEmail}>`,
    to: toEmail,
    replyTo: input.requesterEmail,
    subject: `[AUTO-TAX] 작업공간 개통 문의 - ${input.companyName}`,
    text: [
      "[AUTO-TAX] 작업공간 개통 문의",
      "",
      `회사명: ${input.companyName}`,
      `담당자명: ${input.requesterName}`,
      `이메일: ${input.requesterEmail}`,
      `연락처: ${input.requesterPhone}`,
      "",
      "[문의 내용]",
      input.message,
      "",
      `User-Agent: ${input.userAgent ?? "-"}`,
      `접수시각: ${new Date().toISOString()}`
    ].join("\n")
  });
}
