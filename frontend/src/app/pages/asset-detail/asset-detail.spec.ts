import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { UserInfo } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { AssetDetail } from '../../core/assets/assets.models';
import { AssetsService } from '../../core/assets/assets.service';
import { AssetDetailPage } from './asset-detail';

function makeAsset(overrides: Partial<AssetDetail> = {}): AssetDetail {
  return {
    id: 42,
    name: 'Test Motor',
    description: 'A description',
    location: 'Test City',
    owner: 'owner1',
    created_at: '2026-01-01T00:00:00Z',
    is_owner: false,
    sensor_metrics: [],
    ...overrides,
  };
}

describe('AssetDetailPage', () => {
  let fixture: ComponentFixture<AssetDetailPage>;
  let component: AssetDetailPage;
  let assetsServiceSpy: jasmine.SpyObj<AssetsService>;

  function setup(
    routeId: number,
    getAssetResult: Observable<AssetDetail>,
    authUser: UserInfo | null = null,
  ) {
    assetsServiceSpy = jasmine.createSpyObj('AssetsService', ['getAsset', 'updateAsset']);
    assetsServiceSpy.getAsset.and.returnValue(getAssetResult);

    TestBed.configureTestingModule({
      imports: [AssetDetailPage],
      providers: [
        { provide: AssetsService, useValue: assetsServiceSpy },
        {
          provide: AuthService,
          useValue: { user: signal(authUser), logout: jasmine.createSpy('logout') },
        },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // Must come after provideRouter([]) — it registers its own ActivatedRoute,
        // and the last provider for a token wins.
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: String(routeId) }) } },
        },
      ],
    });

    fixture = TestBed.createComponent(AssetDetailPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const admin: UserInfo = { id: 9, username: 'admin', is_admin: true };

  it('loads the asset on construction using the route id', () => {
    setup(7, of(makeAsset({ id: 7 })));

    expect(assetsServiceSpy.getAsset).toHaveBeenCalledWith(7);
    expect(component.asset()?.id).toBe(7);
    expect(component.loading()).toBeFalse();
  });

  it('sets a load error when the request fails', () => {
    setup(1, throwError(() => new Error('boom')));

    expect(component.loadError()).toBe('Failed to load this asset.');
    expect(component.loading()).toBeFalse();
  });

  describe('ownership gating', () => {
    it('startEdit does nothing when the user is not the owner', () => {
      setup(42, of(makeAsset({ is_owner: false })));
      component.startEdit();
      expect(component.editing()).toBeFalse();
    });

    it('startEdit enters edit mode when the user is the owner', () => {
      setup(42, of(makeAsset({ is_owner: true })));
      component.startEdit();
      expect(component.editing()).toBeTrue();
    });
  });

  describe('saving', () => {
    it('updates the asset and exits edit mode on success', () => {
      setup(42, of(makeAsset({ is_owner: true, name: 'Old Name' })));
      component.startEdit();
      component.form.controls.name.setValue('New Name');

      assetsServiceSpy.updateAsset.and.returnValue(
        of(makeAsset({ is_owner: true, name: 'New Name' })),
      );
      component.save();

      expect(assetsServiceSpy.updateAsset).toHaveBeenCalledWith(
        42,
        jasmine.objectContaining({ name: 'New Name' }),
      );
      expect(component.asset()?.name).toBe('New Name');
      expect(component.editing()).toBeFalse();
      expect(component.saving()).toBeFalse();
    });

    it('shows a specific message and stays in edit mode on a 403 response', () => {
      setup(42, of(makeAsset({ is_owner: true })));
      component.startEdit();
      assetsServiceSpy.updateAsset.and.returnValue(throwError(() => ({ status: 403 })));

      component.save();

      expect(component.saveError()).toBe("Only this asset's owner can make changes.");
      expect(component.editing()).toBeTrue();
      expect(component.saving()).toBeFalse();
    });

    it('shows the server error message on other failures', () => {
      setup(42, of(makeAsset({ is_owner: true })));
      component.startEdit();
      assetsServiceSpy.updateAsset.and.returnValue(
        throwError(() => ({ status: 400, error: { error: 'Unsupported field(s): owner' } })),
      );

      component.save();

      expect(component.saveError()).toBe('Unsupported field(s): owner');
    });

    it('does not submit an invalid form', () => {
      setup(42, of(makeAsset({ is_owner: true })));
      component.startEdit();
      component.form.controls.name.setValue('');

      component.save();

      expect(assetsServiceSpy.updateAsset).not.toHaveBeenCalled();
    });
  });

  describe('cancelEdit', () => {
    it('resets the form to the loaded asset values and exits edit mode', () => {
      setup(
        42,
        of(makeAsset({ is_owner: true, name: 'Original Name', location: 'Original City' })),
      );
      component.startEdit();
      component.form.controls.name.setValue('Changed Name');

      component.cancelEdit();

      expect(component.editing()).toBeFalse();
      expect(component.form.controls.name.value).toBe('Original Name');
    });
  });

  describe('admin capability', () => {
    it('isAdmin is false for a non-admin user', () => {
      setup(42, of(makeAsset({ is_owner: false })));
      expect(component.isAdmin()).toBeFalse();
    });

    it('isAdmin is true for an admin user', () => {
      setup(42, of(makeAsset({ is_owner: false })), admin);
      expect(component.isAdmin()).toBeTrue();
    });

    it('startEdit enters edit mode for a non-owner admin', () => {
      setup(42, of(makeAsset({ is_owner: false })), admin);
      component.startEdit();
      expect(component.editing()).toBeTrue();
    });

    it('startEdit still does nothing for a non-owner, non-admin user', () => {
      setup(42, of(makeAsset({ is_owner: false })));
      component.startEdit();
      expect(component.editing()).toBeFalse();
    });

    it('save includes the owner field for admins', () => {
      setup(42, of(makeAsset({ is_owner: false, owner: 'someone' })), admin);
      component.startEdit();
      component.form.controls.owner.setValue('newowner');

      assetsServiceSpy.updateAsset.and.returnValue(
        of(makeAsset({ is_owner: false, owner: 'newowner' })),
      );
      component.save();

      expect(assetsServiceSpy.updateAsset).toHaveBeenCalledWith(
        42,
        jasmine.objectContaining({ owner: 'newowner' }),
      );
    });

    it('save sends owner: null when the admin clears the owner field', () => {
      setup(42, of(makeAsset({ is_owner: false, owner: 'someone' })), admin);
      component.startEdit();
      component.form.controls.owner.setValue('');

      assetsServiceSpy.updateAsset.and.returnValue(
        of(makeAsset({ is_owner: false, owner: null })),
      );
      component.save();

      expect(assetsServiceSpy.updateAsset).toHaveBeenCalledWith(
        42,
        jasmine.objectContaining({ owner: null }),
      );
    });

    it('save does not include the owner field for a non-admin owner', () => {
      setup(42, of(makeAsset({ is_owner: true })));
      component.startEdit();

      assetsServiceSpy.updateAsset.and.returnValue(of(makeAsset({ is_owner: true })));
      component.save();

      const payload = assetsServiceSpy.updateAsset.calls.mostRecent().args[1];
      expect(payload.owner).toBeUndefined();
    });
  });
});
