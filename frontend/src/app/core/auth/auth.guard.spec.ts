import { TestBed } from '@angular/core/testing';
import { UrlTree, provideRouter } from '@angular/router';

import { AuthService } from './auth.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let authServiceStub: { isAuthenticated: () => boolean };

  function runGuard() {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/assets' } as never),
    );
  }

  beforeEach(() => {
    authServiceStub = { isAuthenticated: () => false };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authServiceStub }, provideRouter([])],
    });
  });

  it('allows navigation when the user is authenticated', () => {
    authServiceStub.isAuthenticated = () => true;
    expect(runGuard()).toBeTrue();
  });

  it('redirects to /login when the user is not authenticated', () => {
    authServiceStub.isAuthenticated = () => false;
    const result = runGuard();
    expect(result).not.toBe(true);
    expect((result as UrlTree).toString()).toBe('/login');
  });
});
