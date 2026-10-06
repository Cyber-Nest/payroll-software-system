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
      console.log('[EmailService stub]', JSON.stringify(message, null, 2));
      return;
    }

    await this.getTransporter().sendMail({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      text: message.body,
      html: message.html
    });
  }
}

export const emailService = new EmailService();
