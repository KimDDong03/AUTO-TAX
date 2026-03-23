import nodemailer from "nodemailer";
import type { AppSettings } from "./domain.js";

export async function sendNotification(settings: AppSettings, subject: string, text: string): Promise<boolean> {
  if (!settings.smtpHost || !settings.smtpFromEmail || settings.notificationEmails.length === 0) {
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
      to: settings.notificationEmails.join(", "),
      subject,
      text
    });

    return true;
  } catch (error) {
    console.warn("[AUTO-TAX] notification send failed:", error);
    return false;
  }
}
