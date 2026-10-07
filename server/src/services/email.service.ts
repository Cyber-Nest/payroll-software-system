import nodemailer from 'nodemailer';
import { env } from '../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

function emailConfigured() {
  return Boolean(env.smtpUser && env.smtpPass);
}

export class EmailService {
  private transporter?: nodemailer.Transporter;

  private getTransporter() {
    if (!this.transporter) {
      const auth = {
        user: env.smtpUser,
        pass: env.smtpPass
      };

      this.transporter = env.smtpHost
        ? nodemailer.createTransport({
            host: env.smtpHost,
            port: env.smtpPort,
            secure: env.smtpSecure,
            auth
          })
        : nodemailer.createTransport({
            service: 'gmail',
            auth
          });
    }
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<void> {
    if (!emailConfigured()) {
      throw new Error('Email is not configured. Set EMAIL_USER and EMAIL_PASS, or SMTP_USER and SMTP_PASS.');
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
