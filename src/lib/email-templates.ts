import type { Mail } from "@/lib/email";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

type Recipient = { name: string; email: string };

type Layout = {
  heading: string;
  intro: string;
  label: string;
  url: string;
  note: string;
};

function layout({ heading, intro, label, url, note }: Layout) {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf9f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1b19">
  <div style="max-width:420px;margin:0 auto">
    <p style="font-weight:600;margin:0 0 24px">chat</p>
    <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 20px;line-height:1.5">${escapeHtml(intro)}</p>
    <p style="margin:0 0 20px"><a href="${safeUrl}" style="display:inline-block;background:#1c1b19;color:#faf9f7;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">${escapeHtml(label)}</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b6862;word-break:break-all">${safeUrl}</p>
    <p style="margin:16px 0 0;font-size:13px;color:#6b6862">${escapeHtml(note)}</p>
  </div>
</body></html>`;
}

export function verificationEmail(user: Recipient, url: string): Mail {
  return {
    to: user.email,
    subject: "Verify your email",
    text: `Hi ${user.name},\n\nConfirm your email to finish creating your account:\n${url}\n\nThe link expires in 24 hours. If this wasn't you, ignore this message.`,
    html: layout({
      heading: "Verify your email",
      intro: `Hi ${user.name}, confirm your email to finish creating your account.`,
      label: "Verify email",
      url,
      note: "The link expires in 24 hours. If this wasn't you, ignore this message.",
    }),
  };
}

export function resetPasswordEmail(user: Recipient, url: string): Mail {
  return {
    to: user.email,
    subject: "Reset your password",
    text: `Hi ${user.name},\n\nSet a new password:\n${url}\n\nThe link works once and expires in 30 minutes. If this wasn't you, ignore this message and your password stays the same.`,
    html: layout({
      heading: "Reset your password",
      intro: `Hi ${user.name}, use the button below to set a new password.`,
      label: "Reset password",
      url,
      note: "The link works once and expires in 30 minutes. If this wasn't you, ignore this message.",
    }),
  };
}
