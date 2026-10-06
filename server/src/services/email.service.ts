import nodemailer from 'nodemailer';
import { env } from '../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

function smtpConfigured() {
  return Boolean(env.smtpHost && env.smtpUser && env.smtpPass);
}

export class EmailService {
  private transporter?: nodemailer.Transporter;

  private getTransporter() {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpSecure,
        auth: {
          user: env.smtpUser,
          pass: env.smtpPass
        }
      });
    }
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<void> {
    if (!smtpConfigured()) {
      throw new Error('SMTP email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.');
    }

    await this.getTransporter().sendMail({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      text: message.body,
      headers: {
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'X-Priority': '3',
        Importance: 'Normal'
      },
      html: message.html
    });
  }
}

export const emailService = new EmailService();
