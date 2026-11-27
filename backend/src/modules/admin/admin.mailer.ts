import fs from 'node:fs/promises';
import path from 'node:path';

export interface AdminMailMessage {
  to: string;
  purpose: 'EMAIL_VERIFY' | 'PASSWORD_RESET';
  adminId: string;
  subject: string;
  otpCode?: string;
  resetUrl?: string;
  expiresAt: string;
  createdAt: string;
}

export interface IAdminMailer {
  sendVerificationOtp(params: {
    to: string;
    adminId: string;
    fullName: string;
    otpCode: string;
    expiresAt: string;
  }): Promise<void>;

  sendPasswordReset(params: {
    to: string;
    adminId: string;
    fullName: string;
    resetToken: string;
    resetUrl: string;
    expiresAt: string;
  }): Promise<void>;
}

/**
 * Sends admin verification / recovery messages via Resend when configured,
 * or appends strictly to a local server-only file (never browser responses/stdout).
 */
export class AdminMailer implements IAdminMailer {
  constructor(
    private readonly options: {
      resendApiKey?: string;
      fromAddress?: string;
      localMailboxFilePath?: string | null;
      onDevMessage?: (msg: AdminMailMessage & { resetToken?: string }) => void;
    } = {}
  ) {}

  async sendVerificationOtp(params: {
    to: string;
    adminId: string;
    fullName: string;
    otpCode: string;
    expiresAt: string;
  }): Promise<void> {
    const subject = 'SpendSense Admin — Email Verification Code';
    const text = [
      `Hello ${params.fullName},`,
      '',
      `Use this one-time verification code to verify your SpendSense Admin email: ${params.otpCode}`,
      `This code expires at ${params.expiresAt}.`,
      '',
      'If you did not request this code, ignore this message.',
    ].join('\n');

    if (this.options.resendApiKey && this.options.fromAddress) {
      await this.dispatchResend(params.to, subject, text);
      return;
    }

    const entry: AdminMailMessage = {
      to: params.to,
      purpose: 'EMAIL_VERIFY',
      adminId: params.adminId,
      subject,
      otpCode: params.otpCode,
      expiresAt: params.expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.options.onDevMessage?.(entry);
    await this.appendLocalMailbox(entry);
  }

  async sendPasswordReset(params: {
    to: string;
    adminId: string;
    fullName: string;
    resetToken: string;
    resetUrl: string;
    expiresAt: string;
  }): Promise<void> {
    const subject = 'SpendSense Admin — Password Recovery';
    const text = [
      `Hello ${params.fullName},`,
      '',
      'A password reset was requested for your SpendSense Admin account.',
      `Open this single-use link to set a new permanent password: ${params.resetUrl}`,
      `This link expires at ${params.expiresAt}.`,
    ].join('\n');

    if (this.options.resendApiKey && this.options.fromAddress) {
      await this.dispatchResend(params.to, subject, text);
      return;
    }

    const entry: AdminMailMessage & { resetToken?: string } = {
      to: params.to,
      purpose: 'PASSWORD_RESET',
      adminId: params.adminId,
      subject,
      resetUrl: params.resetUrl,
      resetToken: params.resetToken,
      expiresAt: params.expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.options.onDevMessage?.(entry);
    await this.appendLocalMailbox(entry);
  }

  private async dispatchResend(to: string, subject: string, text: string): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.options.fromAddress,
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Admin mail provider returned HTTP ${res.status}`);
    }
  }

  private async appendLocalMailbox(entry: AdminMailMessage & { resetToken?: string }): Promise<void> {
    const targetPath = this.options.localMailboxFilePath;
    if (!targetPath) return;
    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      let existing: Array<Record<string, unknown>> = [];
      try {
        const raw = await fs.readFile(targetPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) existing = parsed;
      } catch {
        // Fresh mailbox
      }
      existing.unshift(entry as unknown as Record<string, unknown>);
      await fs.writeFile(targetPath, JSON.stringify(existing.slice(0, 25), null, 2), 'utf8');
    } catch {
      // Never block auth on local file write errors
    }
  }
}
