import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import { Rolle } from '@blitzon/shared';
import { AppUser } from '../entities/app-user.entity';

const TWOFA_REQUIRED_ROLES: string[] = [Rolle.AdminGf, Rolle.Backoffice];

export type LoginResult =
  | { status: 'ok'; accessToken: string }
  | { status: 'setup_required'; tempToken: string }
  | { status: 'verify_required'; tempToken: string };

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AppUser)
    private readonly users: Repository<AppUser>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * REQUIRE_2FA defaults to enabled (hardened Phase 5 behaviour); set to "false" in
   * .env for a temporary plain hashed-password login (e.g. local/demo access before
   * TOTP enrollment is rolled out). Flip back to true/unset before any real deployment.
   */
  private twofaRequired(): boolean {
    return this.config.get<string>('REQUIRE_2FA') !== 'false';
  }

  async validateUser(email: string, password: string): Promise<AppUser> {
    const user = await this.users.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Ungültige Anmeldedaten.');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Ungültige Anmeldedaten.');
    return user;
  }

  /**
   * Admin/Backoffice must complete 2FA before receiving a full access token: first
   * login through by password only returns a short-lived, purpose-scoped tempToken
   * (never a usable session token). JwtAuthGuard rejects any token carrying a
   * `purpose` claim, so a pending token cannot reach business endpoints.
   */
  login(user: AppUser): LoginResult {
    if (this.twofaRequired() && TWOFA_REQUIRED_ROLES.includes(user.rolle)) {
      if (!user.twofaEnabled) {
        return { status: 'setup_required', tempToken: this.signTemp(user.id, 'setup') };
      }
      return { status: 'verify_required', tempToken: this.signTemp(user.id, 'verify') };
    }
    return { status: 'ok', accessToken: this.signFull(user) };
  }

  async issueFullTokenFor(userId: string): Promise<{ accessToken: string }> {
    const user = await this.users.findOneOrFail({ where: { id: userId } });
    return { accessToken: this.signFull(user) };
  }

  private signFull(user: AppUser): string {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      rolle: user.rolle,
      organisationId: user.organisationId,
      repId: user.repId,
    });
  }

  private signTemp(userId: string, purpose: 'setup' | 'verify'): string {
    return this.jwt.sign({ sub: userId, purpose }, { expiresIn: '10m' });
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
