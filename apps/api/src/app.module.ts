import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { OrganisationsModule } from './organisations/organisations.module';
import { SalesRepsModule } from './sales-reps/sales-reps.module';
import { ProdukteModule } from './produkte/produkte.module';
import { AppUsersModule } from './app-users/app-users.module';
import { ContractsModule } from './contracts/contracts.module';
import { AuditModule } from './audit/audit.module';
import { CommissionsModule } from './commissions/commissions.module';
import { ImportModule } from './import/import.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
})
export class AppModule {}
