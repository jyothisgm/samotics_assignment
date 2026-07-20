import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthResponse } from './auth.models';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  function configure() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    localStorage.clear();
    configure();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('starts unauthenticated with no stored token', () => {
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.token()).toBeNull();
    expect(service.user()).toBeNull();
  });

  it('login persists the token and user, and marks the user authenticated', () => {
    const response: AuthResponse = {
      access_token: 'abc123',
      user: { id: 1, username: 'admin', is_admin: true },
    };
    let result: AuthResponse | undefined;

    service.login('admin', 'password123').subscribe((res) => (result = res));

    const req = httpMock.expectOne('/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'admin', password: 'password123' });
    req.flush(response);

    expect(result).toEqual(response);
    expect(service.isAuthenticated()).toBeTrue();
    expect(service.token()).toBe('abc123');
    expect(service.user()).toEqual({ id: 1, username: 'admin', is_admin: true });
    expect(localStorage.getItem('motor_assets.access_token')).toBe('abc123');
    expect(JSON.parse(localStorage.getItem('motor_assets.user')!)).toEqual({
      id: 1,
      username: 'admin',
      is_admin: true,
    });
  });

  it('register persists the token and user', () => {
    const response: AuthResponse = {
      access_token: 'xyz',
      user: { id: 2, username: 'newuser', is_admin: false },
    };

    service.register('newuser', 'password123').subscribe();

    const req = httpMock.expectOne('/auth/register');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'newuser', password: 'password123' });
    req.flush(response);

    expect(service.token()).toBe('xyz');
    expect(service.user()).toEqual({ id: 2, username: 'newuser', is_admin: false });
  });

  it('logout clears the token, user, and localStorage', () => {
    service.login('admin', 'password123').subscribe();
    httpMock
      .expectOne('/auth/login')
      .flush({ access_token: 'abc', user: { id: 1, username: 'admin', is_admin: true } });

    service.logout();

    expect(service.isAuthenticated()).toBeFalse();
    expect(service.token()).toBeNull();
    expect(service.user()).toBeNull();
    expect(localStorage.getItem('motor_assets.access_token')).toBeNull();
    expect(localStorage.getItem('motor_assets.user')).toBeNull();
  });

  it('restores the token and user from localStorage on construction', () => {
    localStorage.setItem('motor_assets.access_token', 'stored-token');
    localStorage.setItem(
      'motor_assets.user',
      JSON.stringify({ id: 3, username: 'samotics', is_admin: false }),
    );

    TestBed.resetTestingModule();
    configure();

    expect(service.isAuthenticated()).toBeTrue();
    expect(service.token()).toBe('stored-token');
    expect(service.user()).toEqual({ id: 3, username: 'samotics', is_admin: false });
  });

  it('treats malformed stored user JSON as no user', () => {
    localStorage.setItem('motor_assets.access_token', 'stored-token');
    localStorage.setItem('motor_assets.user', 'not-json{{{');

    TestBed.resetTestingModule();
    configure();

    expect(service.user()).toBeNull();
  });
});
