import nodemailer from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || "";

/**
 * Creates the Nodemailer transport for Gmail
 */
function getTransporter() {
  if (!GMAIL_APP_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD.replace(/\s+/g, ""), // strip any spaces from Google App Password
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 6000,
    dnsTimeout: 3000,
  });
}

/**
 * Send 6-digit OTP verification email to student/staff commuter
 */
export async function sendOtpEmail(to: string, code: string): Promise<{ sent: boolean; reason?: string }> {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn("⚠️ GMAIL_APP_PASSWORD not set in .env.local. Logging OTP code to terminal console.");
    return { sent: false, reason: "GMAIL_APP_PASSWORD not configured" };
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #f1f5f9; padding: 24px; margin: 0; }
          .card { max-width: 480px; margin: 0 auto; background: #131926; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
          .header { text-align: center; margin-bottom: 24px; }
          .badge { display: inline-block; background: #2563eb; color: #ffffff; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 9999px; margin-bottom: 12px; }
          .title { font-size: 20px; font-weight: 800; color: #ffffff; margin: 0 0 8px 0; }
          .desc { font-size: 13px; color: #94a3b8; margin: 0 0 24px 0; line-height: 1.5; }
          .code-box { background: #0f172a; border: 2px dashed #3b82f6; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px; }
          .otp-code { font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #60a5fa; font-family: monospace; }
          .expiry { font-size: 12px; color: #64748b; margin-top: 6px; }
          .footer { font-size: 11px; color: #475569; text-align: center; border-top: 1px solid #1e293b; padding-top: 16px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <span class="badge">CampusFleet Transit Auth</span>
            <h1 class="title">Institutional Verification Code</h1>
            <p class="desc">Enter this one-time security code to authenticate your institutional commuter session. Valid for 10 minutes.</p>
          </div>
          <div class="code-box">
            <div class="otp-code">${code}</div>
            <div class="expiry">Expires in 10 minutes • Do not share this code</div>
          </div>
          <div class="footer">
            Graphic Era Hill University CampusFleet Automated Transit Gateway.<br>
            Sent from ${GMAIL_USER} • If you did not request this, please ignore this email.
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const sendPromise = transporter.sendMail({
      from: `"CampusFleet Institutional Transit" <${GMAIL_USER}>`,
      to,
      subject: `Your CampusFleet Login Verification Code: ${code}`,
      text: `Your CampusFleet login verification code is: ${code}. Valid for 10 minutes.`,
      html,
    });

    const timeoutPromise = new Promise<{ sent: boolean; reason: string }>((resolve) =>
      setTimeout(() => resolve({ sent: false, reason: "SMTP connection timed out after 6 seconds" }), 6000)
    );

    const result = await Promise.race([
      sendPromise.then(() => ({ sent: true })),
      timeoutPromise,
    ]);

    return result;
  } catch (err: any) {
    console.error("Nodemailer send error:", err);
    return { sent: false, reason: err.message };
  }
}
