import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { UserInfo } from '../../core/auth/auth.models';
import { TopBar } from './top-bar';

describe('TopBar', () => {
  let fixture: ComponentFixture<TopBar>;
  let userSignal: WritableSignal<UserInfo | null>;
  let authServiceStub: { user: WritableSignal<UserInfo | null>; logout: jasmine.Spy };
  let router: Router;

  beforeEach(() => {
    userSignal = signal<UserInfo | null>({ id: 1, username: 'admin', is_admin: true });
    authServiceStub = { user: userSignal, logout: jasmine.createSpy('logout') };

    TestBed.configureTestingModule({
      imports: [TopBar],
      providers: [{ provide: AuthService, useValue: authServiceStub }, provideRouter([])],
    });

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(TopBar);
    fixture.detectChanges();
  });

  it('renders the username and id', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.user-name')?.textContent).toContain('admin');
    expect(el.querySelector('.user-id')?.textContent).toContain('1');
  });

  it('does not render user info when there is no user', () => {
    userSignal.set(null);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.user-info')).toBeFalsy();
  });

  it('logout() calls AuthService.logout and navigates to /login', () => {
    const navigateSpy = spyOn(router, 'navigateByUrl');
    fixture.componentInstance.logout();
    expect(authServiceStub.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });

  it('clicking the logout button triggers logout', () => {
    const navigateSpy = spyOn(router, 'navigateByUrl');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.logout');
    button.click();
    expect(authServiceStub.logout).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/login');
  });
});
