import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AssetsService } from '../../core/assets/assets.service';
import { AssetSummary } from '../../core/assets/assets.models';
import { TopBar } from '../../layout/top-bar/top-bar';

const PER_PAGE = 20;

@Component({
  selector: 'app-assets-list',
  imports: [TopBar, RouterLink],
  templateUrl: './assets-list.html',
  styleUrl: './assets-list.scss',
})
export class AssetsList implements AfterViewInit, OnDestroy {
  private readonly assetsService = inject(AssetsService);

  readonly assets = signal<AssetSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(true);

  @ViewChild('sentinel') private sentinel?: ElementRef<HTMLElement>;

  private nextPage = 1;
  private observer?: IntersectionObserver;

  ngAfterViewInit(): void {
    if (!this.sentinel) {
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          this.loadNextPage();
        }
      },
      { rootMargin: '200px' },
    );
    this.observer.observe(this.sentinel.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private loadNextPage(): void {
    if (this.loading() || !this.hasMore()) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.assetsService.getAssets(this.nextPage, PER_PAGE).subscribe({
      next: (page) => {
        this.assets.update((current) => [...current, ...page.assets]);
        this.nextPage = page.page + 1;
        this.loading.set(false);

        if (page.page >= page.total_pages) {
          this.hasMore.set(false);
          this.observer?.disconnect();
        }
      },
      error: () => {
        this.error.set('Failed to load motor assets.');
        this.loading.set(false);
      },
    });
  }
}
