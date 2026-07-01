import { Controller, Post, Body, UseGuards, Request, Get, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Stricter than the global limit to slow down password brute-forcing.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const user = await this.auth.validateUser(body.email, body.password);
    return this.auth.login(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req: any) {
    return req.user;
  }

  /** Accepts full tokens (voluntary opt-in) and pending "setup" tokens (mandatory 2FA rollout). */
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/setup')
  setup2fa(@Request() req: any) {
    return this.auth.generateTotpSecret(req.user.sub);
  }

  /** Confirms the first TOTP code. If called with a pending "setup" token, also completes login. */
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/activate')
  async activate2fa(@Request() req: any, @Body() body: { token: string }) {
    const valid = await this.auth.verifyTotp(req.user.sub, body.token);
    if (!valid) throw new UnauthorizedException('Ungültiger Code.');
    if (req.user.purpose === 'setup') {
      return this.auth.issueFullTokenFor(req.user.sub);
    }
    return { enabled: true };
  }

  /** Completes login for users who already have 2FA enabled. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(AuthGuard('jwt'))
  @Post('2fa/verify-login')
  async verifyLogin(@Request() req: any, @Body() body: { token: string }) {
    if (req.user.purpose !== 'verify') throw new UnauthorizedException('Keine ausstehende 2FA-Anmeldung.');
    const valid = await this.auth.verifyTotp(req.user.sub, body.token);
    if (!valid) throw new UnauthorizedException('Ungültiger Code.');
    return this.auth.issueFullTokenFor(req.user.sub);
  }
}
