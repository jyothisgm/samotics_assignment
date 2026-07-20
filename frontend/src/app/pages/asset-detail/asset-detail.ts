import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { AssetsService } from '../../core/assets/assets.service';
import { AssetDetail, AssetUpdatePayload } from '../../core/assets/assets.models';
import { TopBar } from '../../layout/top-bar/top-bar';
import { TimeSeriesChart } from '../../shared/time-series-chart/time-series-chart';

@Component({
  selector: 'app-asset-detail',
  imports: [TopBar, TimeSeriesChart, ReactiveFormsModule, RouterLink, DatePipe],
  templateUrl: './asset-detail.html',
  styleUrl: './asset-detail.scss',
})
export class AssetDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly assetsService = inject(AssetsService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  private readonly assetId = Number(this.route.snapshot.paramMap.get('id'));

  readonly asset = signal<AssetDetail | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly isAdmin = computed(() => this.auth.user()?.is_admin ?? false);
  readonly canEdit = computed(() => {
    const asset = this.asset();
    return !!asset && (asset.is_owner || this.isAdmin());
  });

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    location: [''],
    owner: [''],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.assetsService.getAsset(this.assetId).subscribe({
      next: (asset) => {
        this.asset.set(asset);
        this.resetForm(asset);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Failed to load this asset.');
        this.loading.set(false);
      },
    });
  }

  private resetForm(asset: AssetDetail): void {
    this.form.reset({
      name: asset.name,
      description: asset.description ?? '',
      location: asset.location ?? '',
      owner: asset.owner ?? '',
    });
  }

  startEdit(): void {
    if (!this.canEdit()) {
      return;
    }
    this.saveError.set(null);
    this.editing.set(true);
  }

  cancelEdit(): void {
    const current = this.asset();
    if (current) {
      this.resetForm(current);
    }
    this.saveError.set(null);
    this.editing.set(false);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);

    const { name, description, location, owner } = this.form.getRawValue();
    const payload: Partial<AssetUpdatePayload> = { name, description, location };
    if (this.isAdmin()) {
      payload.owner = owner.trim() === '' ? null : owner.trim();
    }

    this.assetsService.updateAsset(this.assetId, payload).subscribe({
      next: (asset) => {
        this.asset.set(asset);
        this.saving.set(false);
        this.editing.set(false);
      },
      error: (err) => {
        this.saving.set(false);
        if (err.status === 403) {
          this.saveError.set("Only this asset's owner can make changes.");
        } else {
          this.saveError.set(err?.error?.error ?? 'Failed to save changes.');
        }
      },
    });
  }
}
