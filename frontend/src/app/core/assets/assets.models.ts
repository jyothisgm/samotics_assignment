export interface AssetSummary {
  id: number;
  name: string;
  location: string;
  is_owner: boolean;
}

export interface AssetsPage {
  assets: AssetSummary[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface SensorReadingPoint {
  timestamp: string;
  value: number;
}

export interface SensorMetricSeries {
  metric: string;
  unit: string | null;
  readings: SensorReadingPoint[];
}

export interface AssetDetail {
  id: number;
  name: string;
  description: string | null;
  location: string | null;
  owner: string | null;
  created_at: string;
  is_owner: boolean;
  sensor_metrics: SensorMetricSeries[];
}

export interface AssetUpdatePayload {
  name: string;
  description: string;
  location: string;
  owner: string | null;
}
