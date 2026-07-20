import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AssetsService } from './assets.service';

describe('AssetsService', () => {
  let service: AssetsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AssetsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAssets requests /assets with page and per_page query params', () => {
    service.getAssets(2, 20).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/assets');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('per_page')).toBe('20');
    req.flush({ assets: [], page: 2, per_page: 20, total: 0, total_pages: 0 });
  });

  it('getAsset requests GET /assets/:id', () => {
    service.getAsset(42).subscribe();

    const req = httpMock.expectOne('/assets/42');
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('updateAsset sends PATCH /assets/:id with the payload', () => {
    service.updateAsset(42, { location: 'New City' }).subscribe();

    const req = httpMock.expectOne('/assets/42');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ location: 'New City' });
    req.flush({});
  });
});
