import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard();

  it('allows a full token (no purpose claim)', () => {
    const user = { sub: 'u1', rolle: 'admin_gf' };
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('rejects a pending 2FA setup token', () => {
    const user = { sub: 'u1', purpose: 'setup' };
    expect(() => guard.handleRequest(null, user)).toThrow(UnauthorizedException);
  });

  it('rejects a pending 2FA verify token', () => {
    const user = { sub: 'u1', purpose: 'verify' };
    expect(() => guard.handleRequest(null, user)).toThrow(UnauthorizedException);
  });

  it('rejects when there is no user at all', () => {
    expect(() => guard.handleRequest(null, null)).toThrow(UnauthorizedException);
  });
});
