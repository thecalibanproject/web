import { expect, it, vi } from 'vitest';
import { guardViewTransitions } from './view-transitions';

it('handles snapshot aborts while preserving the rendering promise', async () => {
  const ready = Promise.reject(new DOMException('Snapshot skipped', 'AbortError'));
  const finished = Promise.reject(new DOMException('Navigation interrupted', 'AbortError'));
  const updateCallbackDone = Promise.resolve();
  const transition = { ready, finished, updateCallbackDone, skipTransition: vi.fn() };
  const start = vi.fn(() => transition);
  const target = { startViewTransition: start } as unknown as Document;
  guardViewTransitions(target);
  const callback = vi.fn();
  const actual = target.startViewTransition(callback);
  expect(actual).toBe(transition);
  expect(actual.updateCallbackDone).toBe(updateCallbackDone);
  expect(start).toHaveBeenCalledWith(callback);
  await Promise.allSettled([ready, finished]);
});

it('leaves browsers without the API alone', () => {
  const target = {} as Document;
  guardViewTransitions(target);
  expect(Object.hasOwn(target, 'startViewTransition')).toBe(false);
});
