import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

export function encryptSin(value: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(env.encryptionKey), Buffer.from(env.encryptionIv));
  return `${cipher.update(value, 'utf8', 'hex')}${cipher.final('hex')}`;
}

export function decryptSin(value: string): string {
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(env.encryptionKey), Buffer.from(env.encryptionIv));
  return `${decipher.update(value, 'hex', 'utf8')}${decipher.final('utf8')}`;
}

export function maskSin(encrypted?: string): string {
  if (!encrypted) return 'XXX XXX XXX';
  const digits = decryptSin(encrypted).replace(/\D/g, '');
  return `XXX XXX ${digits.slice(-3)}`;
}

export function generateTemporaryPassword(): string {
  return `Pay${crypto.randomBytes(4).toString('hex')}!7`;
}

export function validatePasswordRules(password: string, username: string): string[] {
  const failures: string[] = [];
  if (password.length < 7) failures.push('Seven characters.');
  const categories = [/[A-Z]/, /[a-z]/, /\d/, /[!@#$%^&*()_+]/].filter((rule) => rule.test(password)).length;
  if (categories < 3) failures.push('Must have (3) of the following (4): uppercase, lowercase, number, symbol.');
  if (/['"]/.test(password)) failures.push('Single or double quotes.');
  if (password.toLowerCase().includes(username.toLowerCase())) failures.push('Your username.');
  if (password.includes('<')) failures.push('The left angle-bracket character ("<").');
  if (password.includes('|')) failures.push('The pipe character (|).');
  return failures;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
