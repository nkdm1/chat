import { describe, expect, it, vi } from "vitest";
import { acsSender } from "@/lib/email";

const mail = { to: "a@example.com", subject: "s", text: "t", html: "<p>t</p>" };

function client(status: string) {
  return {
    beginSend: vi.fn().mockResolvedValue({
      pollUntilDone: vi.fn().mockResolvedValue({ id: "op-1", status }),
    }),
  };
}

describe("ACS email adapter", () => {
  it("sends through EmailClient.beginSend and waits for the result", async () => {
    const fake = client("Succeeded");
    await acsSender(fake, "no-reply@chat.test").send(mail);
    expect(fake.beginSend).toHaveBeenCalledWith(
      expect.objectContaining({
        senderAddress: "no-reply@chat.test",
        recipients: { to: [{ address: "a@example.com" }] },
      }),
    );
  });

  it("fails when ACS does not succeed, without leaking the recipient", async () => {
    const failure = acsSender(client("Failed"), "x@y.z").send(mail);
    await expect(failure).rejects.toThrow("op-1");
    await expect(failure).rejects.not.toThrow("a@example.com");
  });
});
