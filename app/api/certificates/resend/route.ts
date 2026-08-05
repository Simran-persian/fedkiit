import path from "path";
import fs from "fs";
import prisma from "@/lib/prisma";
import nodemailer from "nodemailer";

async function sendMail({ to, subject, text, attachmentPath }: { to: string; subject: string; text: string; attachmentPath: string; }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    attachments: [{ filename: path.basename(attachmentPath), path: attachmentPath }],
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { certificateId } = body;
    if (!certificateId) {
      return new Response(JSON.stringify({ error: "Missing certificateId" }), { status: 400 });
    }

    const cert = await prisma.certificate.findUnique({ where: { id: certificateId } });
    if (!cert) return new Response(JSON.stringify({ error: "Certificate not found" }), { status: 404 });

    // cert.url expected like "/certificates/<eventId>/<filename>"
    const publicPath = cert.url.startsWith("/") ? cert.url.slice(1) : cert.url;
    const filePath = path.join(process.cwd(), "public", publicPath);

    if (!fs.existsSync(filePath)) {
      return new Response(JSON.stringify({ error: "Certificate file missing on server" }), { status: 410 });
    }

    // Send email
    await sendMail({
      to: cert.userEmail,
      subject: `Your certificate for ${cert.eventId}`,
      text: `Hi ${cert.userName || ""},\n\nResending your certificate for ${cert.eventId}.\n\nRegards.`,
      attachmentPath: filePath,
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("resend-cert error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
