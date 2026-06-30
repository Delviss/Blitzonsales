import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { AppUser } from '../entities/app-user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AppUser)
    private readonly users: Repository<AppUser>,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<AppUser> {
    const user = await this.users.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Ungültige Anmeldedaten.');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Ungültige Anmeldedaten.');
    return user;
  }

  login(user: AppUser): { accessToken: string } {
    const payload = { sub: user.id, email: user.email, rolle: user.rolle };
    return { accessToken: this.jwt.sign(payload) };
  }

  async generateTotpSecret(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    user.twofaSecret = secret;
    await this.users.save(user);
    const otpauthUrl = authenticator.keyuri(user.email, 'BlitzON Control', secret);
    return { secret, otpauthUrl };
  }

  async verifyTotp(userId: string, token: string): Promise<boolean> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    if (!user.twofaSecret) return false;
    const valid = authenticator.verify({ token, secret: user.twofaSecret });
    if (valid && !user.twofaEnabled) {
      user.twofaEnabled = true;
      await this.users.save(user);
    }
    return valid;
  }

  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }
}
