import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncRun } from '../entities/sync-run.entity';
import { AuditModule } from '../audit/audit.module';
import { StatusMasterModule } from '../status-master/status-master.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { JoulesApiClient, JoulesCredential } from './joules-client';
import { JOULES_CLIENT } from './joules.tokens';
import { JoulesSyncService } from './joules-sync.service';
import { JoulesSyncController } from './joules-sync.controller';
import { JoulesSyncScheduler } from './joules-sync.scheduler';

const DEFAULT_BASE_URL = 'https://service.billig-will-ich.de/service/v2';

/** Build the Joules credential from env (I-08). Basic or api-key; else none. */
function credentialFromEnv(config: ConfigService): JoulesCredential {
  const mode = (config.get<string>('JOULES_AUTH_MODE') ?? '').toLowerCase();
  const apiKey = config.get<string>('JOULES_API_KEY');
  const user = config.get<string>('JOULES_BASIC_USER');
  const pass = config.get<string>('JOULES_BASIC_PASS');
  if (mode === 'apikey' && apiKey) return { mode: 'apikey', apiKey };
  if (mode === 'basic' && user && pass) return { mode: 'basic', user, pass };
  // Auto-detect when the mode is unset but a credential is present.
  if (apiKey) return { mode: 'apikey', apiKey };
  if (user && pass) return { mode: 'basic', user, pass };
  return { mode: 'none' };
}

/**
 * Joules / SWA integration (Epic P2, I-08 client + I-09 sync). The API client is
 * provided as a value built from env; with no credential it is a not-configured
 * client so the sync degrades to a clear `nicht_konfiguriert` result and the
 * Excel path (I-12) stays the interim source.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SyncRun]), AuditModule, StatusMasterModule, IngestionModule],
  providers: [
    {
      provide: JOULES_CLIENT,
      useFactory: (config: ConfigService) =>
        new JoulesApiClient({
          baseUrl: config.get<string>('JOULES_BASE_URL') ?? DEFAULT_BASE_URL,
          credential: credentialFromEnv(config),
        }),
      inject: [ConfigService],
    },
    JoulesSyncService,
    JoulesSyncScheduler,
  ],
  controllers: [JoulesSyncController],
  exports: [JoulesSyncService],
})
export class JoulesModule {}
