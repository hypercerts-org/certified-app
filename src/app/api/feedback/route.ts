import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const SUPPORT_EMAIL = "support@hypercerts.org";
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "Certified <no-reply@certified.one>";

export async function POST(req: NextRequest) {
  try {
    const { message, email } = await req.json();

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    // Send feedback to support
    await resend.emails.send({
      from: FROM_EMAIL,
      to: SUPPORT_EMAIL,
      subject: "New feedback for Certified.app",
      text: [
        "New feedback received:",
        "",
        message,
        "",
        email ? `Reply-to: ${email}` : "No email provided",
      ].join("\n"),
      ...(email ? { replyTo: email } : {}),
    });

    // Send confirmation to user if they provided an email
    if (email) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: "Thank you for your feedback to Certified.app",
        text: [
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
    console.error("Feedback error:", error);
    return NextResponse.json({ error: "Failed to send feedback" }, { status: 500 });
  }
}
