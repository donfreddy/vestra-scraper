import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckpointStore, normalizeLead } from '../src/index.js';

const cwd = process.cwd();
let dir = '';

afterEach(() => {
  process.chdir(cwd);
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = '';
  }
});

function inTempCwd(): void {
  dir = mkdtempSync(join(tmpdir(), 'vestra-ckpt-'));
  process.chdir(dir);
}

const lead = (name: string) => normalizeLead({ source: 'google-maps', companyName: name, city: 'Douala' });

describe('CheckpointStore', () => {
  it('round-trips appended leads keyed by id', () => {
    inTempCwd();
    const store = new CheckpointStore('./out/leads.xlsx', 'sig-a');
    const a = lead('Hôtel A');
    const b = lead('Hôtel B');
    store.append(a);
    store.append(b);

    const loaded = new CheckpointStore('./out/leads.xlsx', 'sig-a').load();
    expect([...loaded.keys()].sort()).toEqual([a.id, b.id].sort());
    expect(loaded.get(a.id)?.companyName).toBe('Hôtel A');
  });

  it('is empty when no file exists / after clear()', () => {
    inTempCwd();
    const store = new CheckpointStore('./out/leads.xlsx', 'sig-b');
    expect(store.load().size).toBe(0);
    store.append(lead('X'));
    expect(store.load().size).toBe(1);
    store.clear();
    expect(store.load().size).toBe(0);
  });

  it('tolerates a truncated last line (crash mid-write)', () => {
    inTempCwd();
    const store = new CheckpointStore('./out/leads.xlsx', 'sig-c');
    store.append(lead('Good One'));
    mkdirSync('.vestra-cache', { recursive: true });
    writeFileSync(store.path, '{"id":"broken","compan', { flag: 'a' });

    const loaded = store.load();
    expect(loaded.size).toBe(1);
    expect([...loaded.values()][0]!.companyName).toBe('Good One');
  });

  it('uses a distinct file per run signature', () => {
    inTempCwd();
    expect(new CheckpointStore('./out/x.xlsx', 'sig-1').path).not.toBe(
      new CheckpointStore('./out/x.xlsx', 'sig-2').path,
    );
  });
});
