import { describe, expect, it } from 'vitest';
import { createMemoryPersistence } from '@shared/core';

describe('createMemoryPersistence', () => {
  it('returns null for unset keys', () => {
    const storage = createMemoryPersistence();
    expect(storage.getString('missing')).toBeNull();
  });

  it('roundtrips set/get/remove', () => {
    const storage = createMemoryPersistence();
    storage.set('k', 'v');
    expect(storage.getString('k')).toBe('v');
    storage.remove('k');
    expect(storage.getString('k')).toBeNull();
  });

  it('does not leak across instances', () => {
    const a = createMemoryPersistence();
    const b = createMemoryPersistence();
    a.set('shared', 'first');
    expect(b.getString('shared')).toBeNull();
  });
});
