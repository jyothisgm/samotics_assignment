import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { Login } from './login';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let component: Login;
  let authServiceStub: { login: jasmine.Spy; register: jasmine.Spy };
  let router: Router;

  beforeEach(() => {
    authServiceStub = {
      login: jasmine.createSpy('login'),
      register: jasmine.createSpy('register'),
    };

    TestBed.configureTestingModule({
      imports: [Login],
      providers: [{ provide: AuthService, useValue: authServiceStub }, provideRouter([])],
    });

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('defaults to login mode', () => {
    expect(component.mode()).toBe('login');
  });

  it('does not require a 6-character password in login mode', () => {
    component.form.controls.username.setValue('admin');
    component.form.controls.password.setValue('admin'); // 5 characters
    expect(component.form.valid).toBeTrue();
  });

  it('requires a 6-character password in register mode', () => {
    component.setMode('register');
    fixture.detectChanges();

    component.form.controls.username.setValue('newuser');
    component.form.controls.password.setValue('short');
    expect(component.form.valid).toBeFalse();

    component.form.controls.password.setValue('longenough');
    expect(component.form.valid).toBeTrue();
  });

  it('does not submit an invalid form', () => {
    component.form.controls.username.setValue('');
    component.form.controls.password.setValue('');

    component.submit();

    expect(authServiceStub.login).not.toHaveBeenCalled();
  });

  it('calls AuthService.login in login mode and navigates to /assets on success', () => {
    authServiceStub.login.and.returnValue(
      of({ access_token: 'abc', user: { id: 1, username: 'admin', is_admin: false } }),
    );
    const navigateSpy = spyOn(router, 'navigateByUrl');

    component.form.controls.username.setValue('admin');
    component.form.controls.password.setValue('admin');
    component.submit();

    expect(authServiceStub.login).toHaveBeenCalledWith('admin', 'admin');
    expect(navigateSpy).toHaveBeenCalledWith('/assets');
    expect(component.loading()).toBeFalse();
  });

  it('calls AuthService.register in register mode', () => {
    authServiceStub.register.and.returnValue(
      of({ access_token: 'abc', user: { id: 2, username: 'newuser', is_admin: false } }),
    );
    component.setMode('register');
    fixture.detectChanges();

    component.form.controls.username.setValue('newuser');
    component.form.controls.password.setValue('password123');
    component.submit();

    expect(authServiceStub.register).toHaveBeenCalledWith('newuser', 'password123');
  });

  it('shows the server error message on failure', () => {
    authServiceStub.login.and.returnValue(
      throwError(() => ({ error: { error: 'Invalid username or password' } })),
    );

    component.form.controls.username.setValue('admin');
    component.form.controls.password.setValue('wrong');
    component.submit();

    expect(component.error()).toBe('Invalid username or password');
    expect(component.loading()).toBeFalse();
  });

  it('shows a fallback error message when the server gives no error detail', () => {
    authServiceStub.login.and.returnValue(throwError(() => ({})));

    component.form.controls.username.setValue('admin');
    component.form.controls.password.setValue('wrong');
    component.submit();

    expect(component.error()).toBe('Something went wrong. Please try again.');
  });

  it('switching mode clears any existing error', () => {
    component.error.set('some error');
    component.setMode('register');
    expect(component.error()).toBeNull();
  });
});
