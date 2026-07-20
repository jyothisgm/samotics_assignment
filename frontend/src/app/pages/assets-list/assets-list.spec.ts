import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { AssetsPage } from '../../core/assets/assets.models';
import { AssetsService } from '../../core/assets/assets.service';
import { AssetsList } from './assets-list';

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  observe = jasmine.createSpy('observe');
  disconnect = jasmine.createSpy('disconnect');
  unobserve = jasmine.createSpy('unobserve');

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }

  trigger(isIntersecting: boolean): void {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function makePage(overrides: Partial<AssetsPage> = {}): AssetsPage {
  return {
    assets: [{ id: 1, name: 'Motor 1', location: 'City', is_owner: false }],
    page: 1,
    per_page: 20,
    total: 1,
    total_pages: 1,
    ...overrides,
  };
}

describe('AssetsList', () => {
  let fixture: ComponentFixture<AssetsList>;
  let component: AssetsList;
  let assetsServiceSpy: jasmine.SpyObj<AssetsService>;
  let originalIntersectionObserver: typeof IntersectionObserver;

  function latestObserver(): FakeIntersectionObserver {
    return FakeIntersectionObserver.instances[FakeIntersectionObserver.instances.length - 1];
  }

  beforeEach(() => {
    originalIntersectionObserver = window.IntersectionObserver;
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      FakeIntersectionObserver;
    FakeIntersectionObserver.instances = [];

    assetsServiceSpy = jasmine.createSpyObj('AssetsService', ['getAssets']);

    TestBed.configureTestingModule({
      imports: [AssetsList],
      providers: [
        { provide: AssetsService, useValue: assetsServiceSpy },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });

    fixture = TestBed.createComponent(AssetsList);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
      originalIntersectionObserver;
  });

  it('loads the first page once the sentinel becomes visible', () => {
    assetsServiceSpy.getAssets.and.returnValue(of(makePage()));

    fixture.detectChanges(); // ngAfterViewInit -> observer.observe(sentinel)
    latestObserver().trigger(true);

    expect(assetsServiceSpy.getAssets).toHaveBeenCalledWith(1, 20);
    expect(component.assets().length).toBe(1);
    expect(component.loading()).toBeFalse();
  });

  it('does not load when the sentinel is not intersecting', () => {
    assetsServiceSpy.getAssets.and.returnValue(of(makePage()));
    fixture.detectChanges();

    latestObserver().trigger(false);

    expect(assetsServiceSpy.getAssets).not.toHaveBeenCalled();
  });

  it('appends subsequent pages and advances the page number', () => {
    assetsServiceSpy.getAssets.and.returnValues(
      of(
        makePage({
          page: 1,
          total_pages: 2,
          assets: [{ id: 1, name: 'A', location: 'X', is_owner: false }],
        }),
      ),
      of(
        makePage({
          page: 2,
          total_pages: 2,
          assets: [{ id: 2, name: 'B', location: 'Y', is_owner: false }],
        }),
      ),
    );

    fixture.detectChanges();
    latestObserver().trigger(true);
    latestObserver().trigger(true);

    expect(assetsServiceSpy.getAssets).toHaveBeenCalledTimes(2);
    expect(assetsServiceSpy.getAssets.calls.argsFor(1)).toEqual([2, 20]);
    expect(component.assets().length).toBe(2);
    expect(component.assets().map((a) => a.id)).toEqual([1, 2]);
  });

  it('stops loading and disconnects the observer once total_pages is reached', () => {
    assetsServiceSpy.getAssets.and.returnValue(of(makePage({ page: 1, total_pages: 1 })));
    fixture.detectChanges();
    const observer = latestObserver();

    observer.trigger(true);

    expect(component.hasMore()).toBeFalse();
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it('ignores an overlapping trigger while a request is already in flight', () => {
    const subject = new Subject<AssetsPage>();
    assetsServiceSpy.getAssets.and.returnValue(subject.asObservable());

    fixture.detectChanges();
    const observer = latestObserver();

    observer.trigger(true); // starts loading, still pending
    observer.trigger(true); // should be ignored: loading() is true

    expect(assetsServiceSpy.getAssets).toHaveBeenCalledTimes(1);

    subject.next(makePage());
    subject.complete();

    expect(component.loading()).toBeFalse();
    expect(component.assets().length).toBe(1);
  });

  it('does not request further pages once hasMore is false', () => {
    assetsServiceSpy.getAssets.and.returnValue(of(makePage({ page: 1, total_pages: 1 })));
    fixture.detectChanges();
    const observer = latestObserver();

    observer.trigger(true);
    observer.trigger(true); // hasMore is now false; should be ignored

    expect(assetsServiceSpy.getAssets).toHaveBeenCalledTimes(1);
  });

  it('sets an error message when loading fails', () => {
    assetsServiceSpy.getAssets.and.returnValue(throwError(() => new Error('network error')));
    fixture.detectChanges();

    latestObserver().trigger(true);

    expect(component.error()).toBe('Failed to load motor assets.');
    expect(component.loading()).toBeFalse();
  });

  it('disconnects the IntersectionObserver on destroy', () => {
    assetsServiceSpy.getAssets.and.returnValue(of(makePage()));
    fixture.detectChanges();
    const observer = latestObserver();

    fixture.destroy();

    expect(observer.disconnect).toHaveBeenCalled();
  });
});
