const https = require('node:https');
const config = require('../config/env');

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  nodemailer = null;
}

class MailerService {
  constructor() {
    this.transporter = null;
    this.initializeTools();
  }

  initializeTools() {
    if (nodemailer && config.smtpUser && config.smtpPass) {
      try {
        this.transporter = nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpPort === 465,
          auth: {user: config.smtpUser, pass: config.smtpPass }
        });
      } catch (err) {
        console.warn('[Mailer] Ngmail transporter error:', err.message);
      }
    }
  }

  async sendMail({ to, subject, text, html }) {
    // 1. SMTP (GMail App Password or Provider)
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: `Ahmed Musthaffa <${config.smtpUser}>`,
          to,
          subject,
          text,
          html
        });
        return { success: true, messageId: info.messageId };
      } catch (err) {
        console.error('[Mailer] SMTP Delivery Failed:', err.message);
      }
    }

    // 2. Resend HTTPS API Free Plan
    if (config.resendApiKey) {
      return new Promise((resolve) => {
        const payload = JSON.stringify({
          from: 'Ahmed <onboarding@resend.dev>',
          to,
          subject,
          html
        });

        const req = https.request('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.resendApiKey}`,
            'Content-Type': 'application/json'
          }
        }, (res) => {
          resolve({ success: res.statusCode >= 200 && res.statusCode < 300 });
        });

        req.on('error', () => resolve({ success: false }));
        req.write(payload);
        req.end();
      });
    }


    // 3. Safe Structured Local Delivery
    console.log('--------------------------------------------------');
    console.log(`[EMAIL SIMULATOR] From: Ahmed Portfolio -> To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`--------------------------------------------------`);
    return { success: true, localSimulated: true };
  }


  async sendContactNotification(submission) {
    const clientName = `${submission.firstName || ''} ${submission.lastName || ''}`.trim() || 'Valued Client';


    // 1. Owner Email Notification
    const ownerHtml = `
      <div style="font-family: 'Segoe UI', arial, sans-serif; background: #0e0f12; color: #e0e0e0; padding: 30px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #2c304d;">
        <h2 style="color: #ccff00; margin-top: 0; border-bottom: 1px solid #2c304d; padding-bottom: 12px;">⚡ New Lead - Ahmed Portfolio</h2>
        <p style="font-size: 15px;">You received a new project inquiry from <strong style="color: #ffffff;">${clientName}</strong>:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 18px 0;">
          <tr><td style="padding: 8px; color: #999;">Email:</td><td style="padding: 8px; color: #fff;"><a href="mailto:${submission.email}" style="color: #ccff00;">${submission.email}</a></td></tr>
          <tr><td style="padding: 8px; color: #999;">Phone:</td><td style="padding: 8px; color: #fff;">${submission.phone || 'N/A'}</td></tr>
          <tr><td style="padding: 8px; color: #999;">Date:</td><td style="padding: 8px; color: #fff;">${new Date().toUTCString()}</td></tr>
        </table>
        <div style="background: #171924; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ccff00;">
          <p style="margin: 0; color: #ffffff; line-height: 1.6;">${submission.description}</p>
        </div>
        <a href="mailto:${submission.email}?subject=Re:%20Your%20Project%20Inquiry%20-%20Ahmed" style="display: inline-block; background: #ccff00; color: #000; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 700; margin-top: i06px;">Reply to Client</a>
      </div>
    `;


    // 2. Client Autoresponder
    const clientHtml = `
      <div style="font-family: 'Segoe UI', arial, sans-serif; background: #0e0f12; color: #e0e0e0; padding: 30px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #2c304d;">
        <h2 style="color: #ccff00; margin-top: 0;">Thank You for Reaching Out!</h2>
        <p>Hi <strong>${clientName}</strong>,</p>
        <p>I have received your project message and will review your requirements shortly. I will get back to you within <strong style="color: #ccff00;">24 hours</strong>.</p>
        <div style="background: #171924; padding: 14px; border-radius: 6px; margin: 20px 0;">
          <em style="color: #aaa;">"${submission.description}..."</em>
        </div>
        <p style="margin-top: 20px; border-top: 1px solid #2c304d; padding-top: 16px;">
          Best regards,<br>
          <strong style="color: #ffffff;">Ahmed Musthaffa</strong><br>
          <span style="color: #ccff00; font-size: 13px;">Full Stack Developer</span>
        </p>
      </div>
    `;

    await Promise.all([
      this.sendMail({
        to: config.ownerEmail,
        subject: `⚄ New Lead from ${clientName}`,
        text: `New lead: ${clientName} (${submission.email}): ${submission.description}`,
        html: ownerHtml
      }),
      this.sendMail({
        to: submission.email,
        subject: 'Thank you for contacting Ahmed Musthaffa',
        text: `Hi ${clientName}, thank you for reaching out! I will review your message and reply within 24 hours.`,
        html: clientHtml
      })
    ]);

    return { delivered: true, recipient: config.ownerEmail };
  }
}

module.exports = new MailerService();
