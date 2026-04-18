import fs from 'fs';
import path from 'path';
import type { ScanRecord } from '@/types/scan';

const DATA_DIR = process.env.SCAN_DATA_DIR
  ? path.resolve(process.env.SCAN_DATA_DIR)
  : path.resolve(process.cwd(), 'data', 'scans');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

export function saveScan(scan: ScanRecord): void {
  ensureDir();
  fs.writeFileSync(filePath(scan.id), JSON.stringify(scan, null, 2), 'utf-8');
}

export function getScan(id: string): ScanRecord | null {
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf-8')) as ScanRecord;
  } catch {
    return null;
  }
}

export function updateScan(id: string, updates: Partial<ScanRecord>): ScanRecord | null {
  const existing = getScan(id);
  if (!existing) return null;
  const updated = { ...existing, ...updates };
  saveScan(updated);
  return updated;
}
