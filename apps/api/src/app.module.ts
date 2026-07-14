import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { OrganisationsModule } from './organisations/organisations.module';
import { SalesRepsModule } from './sales-reps/sales-reps.module';
import { ProdukteModule } from './produkte/produkte.module';
import { AppUsersModule } from './app-users/app-users.module';
import { ContractsModule } from './contracts/contracts.module';
import { AuditModule } from './audit/audit.module';
import { CommissionsModule } from './commissions/commissions.module';
import { ImportModule } from './import/import.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatenschutzModule } from './datenschutz/datenschutz.module';
import { ConfigStoreModule } from './config-store/config-store.module';
import { StatusMasterModule } from './status-master/status-master.module';
import { PostingObjectsModule } from './posting-objects/posting-objects.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { JoulesModule } from './joules/joules.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
        migrations: [__dirname + '/migrations/*.js'],
        migrationsRun: true,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    OrganisationsModule,
    SalesRepsModule,
    ProdukteModule,
    AppUsersModule,
    ContractsModule,
    AuditModule,
    CommissionsModule,
    ImportModule,
    DashboardModule,
    DatenschutzModule,
    ConfigStoreModule,
    StatusMasterModule,
    PostingObjectsModule,
    IngestionModule,
    JoulesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
