import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { AppUser } from '../entities/app-user.entity';

function makeUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: 'u1', email: 'a@b.de', password: 'hash', rolle: 'admin_gf',
    organisationId: null, organisation: null, repId: null, rep: null,
    twofaSecret: null, twofaEnabled: false, ...overrides,
  } as AppUser;
}

describe('AuthService 2FA-gated login', () => {
  let service: AuthService;
  let sign: jest.Mock;

  async function buildService(requireTwofa: 'true' | 'false' = 'true') {
    sign = jest.fn().mockReturnValue('signed-token');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(AppUser), useValue: { findOne: jest.fn(), findOneOrFail: jest.fn(), save: jest.fn() } },
        { provide: JwtService, useValue: { sign } },
        { provide: ConfigService, useValue: { get: () => (requireTwofa === 'false' ? 'false' : undefined) } },
      ],
    }).compile();
    return module.get(AuthService);
  }

  beforeEach(async () => {
    service = await buildService();
  });

  it('requires 2FA setup for an admin_gf without twofaEnabled', () => {
    const result = service.login(makeUser({ rolle: 'admin_gf', twofaEnabled: false }));
    expect(result.status).toBe('setup_required');
    expect(sign).toHaveBeenCalledWith({ sub: 'u1', purpose: 'setup' }, { expiresIn: '10m' });
  });

  it('requires 2FA verification for an admin_gf who already enabled it', () => {
    const result = service.login(makeUser({ rolle: 'admin_gf', twofaEnabled: true }));
    expect(result.status).toBe('verify_required');
    expect(sign).toHaveBeenCalledWith({ sub: 'u1', purpose: 'verify' }, { expiresIn: '10m' });
  });

  it('requires 2FA for backoffice too', () => {
    const result = service.login(makeUser({ rolle: 'backoffice', twofaEnabled: false }));
    expect(result.status).toBe('setup_required');
  });

  it('issues a full token immediately for roles that do not require 2FA', () => {
    const result = service.login(makeUser({ rolle: 'aussendienst', twofaEnabled: false }));
    expect(result.status).toBe('ok');
    expect((result as any).accessToken).toBe('signed-token');
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({ sub: 'u1', rolle: 'aussendienst' }));
  });

  it('REQUIRE_2FA=false lets admin_gf/backoffice log in with just their hashed password', async () => {
    const noTwofaService = await buildService('false');
    const result = noTwofaService.login(makeUser({ rolle: 'admin_gf', twofaEnabled: false }));
    expect(result.status).toBe('ok');
    expect((result as any).accessToken).toBe('signed-token');
  });
});
