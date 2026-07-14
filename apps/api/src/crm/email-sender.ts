import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailOutbox } from '../entities/email-outbox.entity';

/** A single outgoing message. */
export interface EmailMessage {
  to: string[];
  subject: string;
  body: string;
  anlass?: string;
  referenzId?: string | null;
}

/** Injection token so a real transport can replace the default recorder. */
export const EMAIL_SENDER = 'EMAIL_SENDER';

/**
 * The mail transport abstraction (I-32). The concrete sender / recipient list is
 * an open input, so the default implementation records the message to the
 * `email_outbox` table (and logs it) rather than contacting an external MTA. A
 * real SMTP/API transport can be provided against this same interface later.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<EmailOutbox>;
}

@Injectable()
export class LoggingEmailSender implements EmailSender {
  constructor(
    @InjectRepository(EmailOutbox) private readonly outboxRepo: Repository<EmailOutbox>,
  ) {}

  async send(message: EmailMessage): Promise<EmailOutbox> {
    const row = this.outboxRepo.create({
      empfaenger: message.to.join(', '),
      betreff: message.subject,
      koerper: message.body,
      anlass: message.anlass ?? null,
      referenzId: message.referenzId ?? null,
      transport: 'log',
    });
    const saved = await this.outboxRepo.save(row);
    // Surfaced in the server log so a dispatch is observable in a dev/CI run.
    // eslint-disable-next-line no-console
    console.log(`[email:${saved.transport}] → ${saved.empfaenger} · ${saved.betreff}`);
    return saved;
  }
}
