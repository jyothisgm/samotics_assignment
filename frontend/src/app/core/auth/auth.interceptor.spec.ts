import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('does not add an Authorization header when there is no token', () => {
    http.get('/assets').subscribe();
    const req = httpMock.expectOne('/assets');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('adds a Bearer Authorization header when a token is present', () => {
    authService.login('someuser', 'password123').subscribe();
    httpMock.expectOne('/auth/login').flush({ access_token: 'abc123', client: null });

    http.get('/assets').subscribe();
    const req = httpMock.expectOne('/assets');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc123');
    req.flush({});
  });

  it('logs out and redirects to /login on a 401 response', () => {
    authService.login('someuser', 'password123').subscribe();
    httpMock.expectOne('/auth/login').flush({ access_token: 'abc123', client: null });

    const navigateSpy = spyOn(router, 'navigateByUrl');

    http.get('/assets').subscribe({ error: () => undefined });
    const req = httpMock.expectOne('/assets');
    req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.isAuthenticated()).toBeFalse();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('does not log out on non-401 errors', () => {
    authService.login('someuser', 'password123').subscribe();
    httpMock.expectOne('/auth/login').flush({ access_token: 'abc123', client: null });

    http.get('/assets').subscribe({ error: () => undefined });
    const req = httpMock.expectOne('/assets');
    req.flush({ message: 'Server error' }, { status: 500, statusText: 'Server Error' });

    expect(authService.isAuthenticated()).toBeTrue();
  });
});
