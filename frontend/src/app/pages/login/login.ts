import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

type Mode = 'login' | 'register';

// Mirrors the backend's rule: at least 8 characters, a lowercase letter, an
// uppercase letter, a number, and a symbol.
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<Mode>('login');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  constructor() {
    // Registering enforces the backend's password complexity rule; logging in must
    // not, since login has to accept whatever password an account already has.
    effect(() => {
      const complexity = this.mode() === 'register' ? [Validators.pattern(PASSWORD_PATTERN)] : [];
      this.form.controls.password.setValidators([Validators.required, ...complexity]);
      this.form.controls.password.updateValueAndValidity();
    });
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const { username, password } = this.form.getRawValue();
    const request$ =
      this.mode() === 'login'
        ? this.auth.login(username, password)
        : this.auth.register(username, password);

    request$.subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/assets');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.error ?? 'Something went wrong. Please try again.');
      },
    });
  }
}
