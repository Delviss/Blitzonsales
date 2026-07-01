import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppUser } from '../entities/app-user.entity';
import { AppUsersService } from './app-users.service';
import { AppUsersController } from './app-users.controller';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([AppUser]), AuditModule, AuthModule],
  providers: [AppUsersService],
  controllers: [AppUsersController],
  exports: [AppUsersService],
})
export class AppUsersModule {}
