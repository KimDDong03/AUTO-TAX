import nodemailer from "nodemailer";

export type ContactInquiryInput = {
  category: string;
  message: string;
  email: string;
  name: string;
  phone: string;
  region: string;
  requestIp: string;
  requestUserAgent: string;
};

function envString(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function envBool(key: string, fallback: boolean): boolean {
  const value = envString(key);
  if (value === undefined) {
    return fallback;
  }
  return value !== "0" && value.toLowerCase() !== "false";
}

function envNumber(key: string, fallback: number): number {
  const parsed = Number(envString(key));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getRequiredEnv(key: string): string {
  const value = envString(key);
  if (!value) {
    throw new Error(`${key} 환경변수가 설정되지 않았습니다.`);
  }
  return value;
}

export async function sendContactInquiryEmail(input: ContactInquiryInput): Promise<{ messageId?: string }> {
  const smtpHost = getRequiredEnv("AUTO_TAX_CONTACT_SMTP_HOST");
  const smtpPort = envNumber("AUTO_TAX_CONTACT_SMTP_PORT", 465);
  const smtpSecure = envBool("AUTO_TAX_CONTACT_SMTP_SECURE", smtpPort === 465);
  const smtpUser = getRequiredEnv("AUTO_TAX_CONTACT_SMTP_USER");
  const smtpPass = getRequiredEnv("AUTO_TAX_CONTACT_SMTP_PASS");
  const fromEmail = envString("AUTO_TAX_CONTACT_EMAIL_FROM") ?? smtpUser;
  const fromName = envString("AUTO_TAX_CONTACT_EMAIL_FROM_NAME") ?? "AUTO-TAX";
  const toEmail = envString("AUTO_TAX_CONTACT_TO_EMAIL") ?? "auto-tax@kiyo.kr";
  const subject = `AUTO-TAX ${input.category}`;
  const text = [
    `문의 카테고리: ${input.category}`,
    "",
    "문의 내용:",
    input.message,
    "",
    `답변 받을 이메일: ${input.email}`,
    `성함/회사명: ${input.name}`,
    `담당자 연락처: ${input.phone}`,
    `지역: ${input.region}`,
    "",
    `요청 IP: ${input.requestIp}`,
    `User-Agent: ${input.requestUserAgent}`,
    "",
    "[개인정보 수집·이용 동의: 동의함]"
  ].join("\n");

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const result = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: toEmail,
    replyTo: input.email,
    subject,
    text
  });

  return { messageId: result.messageId };
}
