import nodemailer from "nodemailer";
import type { AppSettings } from "./domain.js";

function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function resolveNotificationEmails(settings: AppSettings): string[] {
  const opsEmails = envString("AUTO_TAX_OPS_EMAILS")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return opsEmails && opsEmails.length > 0 ? opsEmails : settings.notificationEmails;
}

export async function sendNotification(settings: AppSettings, subject: string, text: string): Promise<boolean> {
  const notificationEmails = resolveNotificationEmails(settings);
  if (!settings.smtpHost || !settings.smtpFromEmail || notificationEmails.length === 0) {
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      auth: settings.smtpUser ? { user: settings.smtpUser, pass: settings.smtpPass } : undefined
    });

    await transporter.sendMail({
      from: settings.smtpFromName
        ? `"${settings.smtpFromName}" <${settings.smtpFromEmail}>`
        : settings.smtpFromEmail,
      to: notificationEmails.join(", "),
      subject,
      text
    });

    return true;
  } catch (error) {
    console.warn("[AUTO-TAX] notification send failed:", error);
    return false;
  }
}
