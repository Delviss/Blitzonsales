import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Rejects tokens carrying a `purpose` claim (issued mid-2FA-challenge, see
 * AuthService.login) so a pending token can never reach a business endpoint;
 * only /auth/2fa/* (guarded with the bare passport AuthGuard) accepts those.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any): any {
    if (err || !user) throw err || new UnauthorizedException();
    if (user.purpose) throw new UnauthorizedException('2FA-Anmeldung nicht abgeschlossen.');
    return user;
  }
}
