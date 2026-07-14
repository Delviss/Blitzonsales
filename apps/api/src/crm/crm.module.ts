import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wiedervorlage } from '../entities/wiedervorlage.entity';
import { EmailOutbox } from '../entities/email-outbox.entity';
import { AppUser } from '../entities/app-user.entity';
import { AuditModule } from '../audit/audit.module';
import { ConfigStoreModule } from '../config-store/config-store.module';
import { WiedervorlageService } from './wiedervorlage.service';
import { WiedervorlageController } from './wiedervorlage.controller';
import { WiedervorlageScheduler } from './wiedervorlage.scheduler';
import { EMAIL_SENDER, LoggingEmailSender } from './email-sender';

/**
 * CRM / lead-time follow-up module (Epic P7, I-31/I-32). Evaluates contract
 * intake against the lead-time rule and dispatches Wiedervorlage notifications.
 * The mail transport is bound behind the `EMAIL_SENDER` token so a real sender
 * can replace the default recording one without touching callers.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Wiedervorlage, EmailOutbox, AppUser]),
    AuditModule,
    ConfigStoreModule,
  ],
  providers: [
    WiedervorlageService,
    WiedervorlageScheduler,
    { provide: EMAIL_SENDER, useClass: LoggingEmailSender },
  ],
  controllers: [WiedervorlageController],
  exports: [WiedervorlageService, EMAIL_SENDER],
})
export class CrmModule {}
