import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { checkCsrf } from "@/lib/auth/csrf";
import { getSessionDid } from "@/lib/auth/session";
import { stripInvisible } from "@/lib/utils/sanitize";
import { parseJsonBody } from "@/lib/utils/api";
import { logSafe } from "@/lib/utils/log-safe";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const SUPPORT_EMAIL = "support@hypercerts.org";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Certified <no-reply@certified.one>";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  if (!resend) return NextResponse.json({ error: "Feedback is not configured" }, { status: 503 });

  const parsed = await parseJsonBody(req, "[feedback]");
  if (!parsed.ok) return parsed.response;

  try {
    const b = (parsed.body ?? {}) as { message?: unknown; email?: unknown; handle?: unknown };
    const message = typeof b.message === "string" ? stripInvisible(b.message) : "";
    const email = typeof b.email === "string" ? stripInvisible(b.email) : "";
    // The handle is self-reported by the client and is used only for
    // display in the email (greeting + "Sent by" line). The DID is
    // re-derived server-side from the session cookie so it's
    // trustworthy — we don't accept a client-supplied DID.
    const clientHandle =
      typeof b.handle === "string" ? stripInvisible(b.handle).trim() : "";

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (message.length > 5000) {
      return NextResponse.json({ error: "Message is too long (max 5000 characters)" }, { status: 400 });
    }
    if (email.length > 254) {
      return NextResponse.json({ error: "Email address is too long" }, { status: 400 });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Trust the server-side session for the DID. If the user isn't
    // signed in, senderDid is null and the email just omits it.
    const senderDid = await getSessionDid();
    const handle = clientHandle || null;

    // ---- Support email ------------------------------------------------
    // Build a "Sent by" block that includes whichever identity fields
    // we were able to determine, so support@ can always see who a
    // given feedback came from.
    const identityLines: string[] = [];
    if (handle) identityLines.push(`  Handle: @${handle}`);
    if (senderDid) identityLines.push(`  DID:    ${senderDid}`);
    if (email) identityLines.push(`  Email:  ${email}`);
    if (identityLines.length === 0) {
      identityLines.push("  (anonymous — not signed in, no email provided)");
    }

    await resend.emails.send({
      from: FROM_EMAIL,
      to: SUPPORT_EMAIL,
      subject: "New feedback for Certified.app",
      text: [
        "New feedback received:",
        "",
        message,
        "",
        "Sent by:",
        ...identityLines,
      ].join("\n"),
      ...(email ? { replyTo: email } : {}),
    });

    // ---- Thank-you email to the user ----------------------------------
    // Only sent if they provided an email address. Greet by handle
    // when we have one so it feels like a reply rather than a form
    // letter.
    if (email) {
      const greeting = handle ? `Hi @${handle},` : "Hi there,";
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: "Thank you for your feedback to Certified",
        text: [
          greeting,
          "",
          "Thank you for sharing your feedback with us!",
          "",
          "We've received the following message:",
          "",
          `"${message}"`,
          "",
          "We appreciate your input and will review it carefully.",
          "",
          "Best regards,",
          "The Certified Team",
        ].join("\n"),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logSafe("[feedback] send failed", error);
    return NextResponse.json({ error: "Failed to send feedback" }, { status: 500 });
  }
}
