import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AssetDetail, AssetsPage, AssetUpdatePayload } from './assets.models';

@Injectable({ providedIn: 'root' })
export class AssetsService {
  private readonly http = inject(HttpClient);

  getAssets(page: number, perPage: number): Observable<AssetsPage> {
    return this.http.get<AssetsPage>('/assets', {
      params: { page, per_page: perPage },
    });
  }

  getAsset(id: number): Observable<AssetDetail> {
    return this.http.get<AssetDetail>(`/assets/${id}`);
  }

  updateAsset(id: number, payload: Partial<AssetUpdatePayload>): Observable<AssetDetail> {
    return this.http.patch<AssetDetail>(`/assets/${id}`, payload);
  }
}
