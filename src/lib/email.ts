import nodemailer from "nodemailer";
import { env } from "@/lib/env";

export type Mail = { to: string; subject: string; text: string; html: string };

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER
    ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
    : undefined,
});

export async function sendMail(mail: Mail) {
  await transport.sendMail({ from: env.MAIL_FROM, ...mail });
}

/**
 * Fire-and-forget. We deliberately don't await delivery inside auth endpoints so
 * response time doesn't reveal whether an account exists.
 */
export function sendMailInBackground(mail: Mail) {
  sendMail(mail).catch((err) => {
    console.error(`[mail] failed to send "${mail.subject}"`, err);
  });
}
