import nodemailer from "nodemailer";

/** Sends through Gmail. In local development without SMTP settings, it prints the message instead. */
export async function sendEmail(message: { to: string; subject: string; text: string }): Promise<void> {
  const { SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;

  if (!SMTP_USER || !SMTP_PASS) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP_USER and SMTP_PASS must be set to send email.");
    console.info(`Email to ${message.to}: ${message.subject}\n${message.text}`);
    return;
  }

  const transport = nodemailer.createTransport({ service: "gmail", auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await transport.sendMail({ from: MAIL_FROM || SMTP_USER, ...message });
}
