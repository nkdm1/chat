import { EmailClient } from "@azure/communication-email";
import { createTransport } from "nodemailer";
import { azureCredential } from "@/lib/azure";
import { env } from "@/lib/env";

export type Mail = { to: string; subject: string; text: string; html: string };

/** Delivery is pluggable: SMTP (Mailpit locally) or Azure Communication Services. */
export type EmailSender = { send(mail: Mail): Promise<void> };

export function smtpSender(): EmailSender {
  const transport = createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  });
  return {
    async send(mail) {
      await transport.sendMail({ from: env.MAIL_FROM, ...mail });
    },
  };
}

type AcsClient = Pick<EmailClient, "beginSend">;

export function acsSender(
  client: AcsClient = env.ACS_CONNECTION_STRING
    ? new EmailClient(env.ACS_CONNECTION_STRING)
    : new EmailClient(env.ACS_ENDPOINT ?? "", azureCredential()),
  senderAddress = env.ACS_SENDER_ADDRESS ?? "",
): EmailSender {
  return {
    async send(mail) {
      const poller = await client.beginSend({
        senderAddress,
        recipients: { to: [{ address: mail.to }] },
        content: {
          subject: mail.subject,
          plainText: mail.text,
          html: mail.html,
        },
      });
      const result = await poller.pollUntilDone();
      if (result.status !== "Succeeded") {
        // Operation id only: never log the recipient or the body (it holds tokens).
        throw new Error(`ACS email ${result.status} (operation ${result.id})`);
      }
    },
  };
}

let sender: EmailSender | undefined;
function getSender() {
  sender ??= env.EMAIL_PROVIDER === "acs" ? acsSender() : smtpSender();
  return sender;
}

export async function sendMail(mail: Mail) {
  await getSender().send(mail);
}

/**
 * Fire-and-forget. We deliberately don't await delivery inside auth endpoints so
 * response time doesn't reveal whether an account exists.
 */
export function sendMailInBackground(mail: Mail) {
  sendMail(mail).catch((error: unknown) => {
    console.error(`[mail] failed to send "${mail.subject}"`, error);
  });
}
