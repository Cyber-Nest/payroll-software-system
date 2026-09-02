export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export class EmailService {
  async send(message: EmailMessage): Promise<void> {
    console.log('[EmailService stub]', JSON.stringify(message, null, 2));
  }
}

export const emailService = new EmailService();
