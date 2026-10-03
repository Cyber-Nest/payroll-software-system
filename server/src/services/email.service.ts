import net from 'net';
import tls from 'tls';
import { env } from '../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

type SmtpSocket = net.Socket | tls.TLSSocket;
const SMTP_TIMEOUT_MS = 15000;

function escapeHeader(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function escapeAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

function dotStuff(value: string) {
  return value.replace(/^\./gm, '..');
}

function createMimeMessage(message: EmailMessage) {
  const from = escapeHeader(env.emailFrom);
  const to = escapeHeader(message.to);
  const subject = escapeHeader(message.subject);
  const boundary = `payhours-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  if (message.html) {
    return [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.body,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      message.html,
      '',
      `--${boundary}--`
    ].join('\r\n');
  }

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    message.body
  ].join('\r\n');
}

function readResponse(socket: SmtpSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('SMTP timed out'));
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    socket.on('data', onData);
    socket.on('error', onError);
    socket.on('timeout', onTimeout);
  });
}

async function expect(socket: SmtpSocket, allowedCodes: number[]) {
  const response = await readResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!allowedCodes.includes(code)) throw new Error(`SMTP failed: ${response.trim()}`);
  return response;
}

async function command(socket: SmtpSocket, line: string, allowedCodes: number[]) {
  socket.write(`${line}\r\n`);
  return expect(socket, allowedCodes);
}

function connectPlain(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(env.smtpPort, env.smtpHost, () => resolve(socket));
    socket.setTimeout(SMTP_TIMEOUT_MS);
    socket.once('error', reject);
  });
}

function connectTls(): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(env.smtpPort, env.smtpHost, { servername: env.smtpHost }, () => resolve(socket));
    socket.setTimeout(SMTP_TIMEOUT_MS);
    socket.once('error', reject);
  });
}

function upgradeToTls(socket: net.Socket): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({ socket, servername: env.smtpHost }, () => resolve(secureSocket));
    secureSocket.setTimeout(SMTP_TIMEOUT_MS);
    secureSocket.once('error', reject);
  });
}

export class EmailService {
  async send(message: EmailMessage): Promise<void> {
    if (env.smtpHost) {
      await this.sendWithSmtp(message);
      return;
    }

    if (!env.resendApiKey) {
      console.log('[EmailService stub]', JSON.stringify(message, null, 2));
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [message.to],
        subject: message.subject,
        text: message.body,
        html: message.html
      })
    });

    if (!response.ok) {
      throw new Error(`Resend email failed: ${response.status} ${await response.text()}`);
    }
  }

  private async sendWithSmtp(message: EmailMessage): Promise<void> {
    let socket: SmtpSocket = env.smtpSecure ? await connectTls() : await connectPlain();
    try {
      await expect(socket, [220]);
      await command(socket, `EHLO ${env.smtpHost}`, [250]);
      if (!env.smtpSecure) {
        await command(socket, 'STARTTLS', [220]);
        socket = await upgradeToTls(socket as net.Socket);
        await command(socket, `EHLO ${env.smtpHost}`, [250]);
      }
      if (env.smtpUser && env.smtpPass) {
        const auth = Buffer.from(`\0${env.smtpUser}\0${env.smtpPass}`).toString('base64');
        await command(socket, `AUTH PLAIN ${auth}`, [235]);
      }
      await command(socket, `MAIL FROM:<${escapeAddress(env.emailFrom)}>`, [250]);
      await command(socket, `RCPT TO:<${escapeAddress(message.to)}>`, [250, 251]);
      await command(socket, 'DATA', [354]);
      socket.write(`${dotStuff(createMimeMessage(message))}\r\n.\r\n`);
      await expect(socket, [250]);
      await command(socket, 'QUIT', [221]);
    } finally {
      socket.end();
    }
  }
}

export const emailService = new EmailService();

