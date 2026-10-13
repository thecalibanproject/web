import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { captureErrorMessage } from './capture';

const err = (status: number, message: string) => new ApiError(status, message);

describe('captureErrorMessage', () => {
  it('maps each refusal to a plain message', () => {
    expect(captureErrorMessage(err(404, 'run not found'), 'good')).toMatch(/no longer exists/);
    expect(captureErrorMessage(err(409, 'the run has not finished'), 'good')).toMatch(
      /has not finished yet/,
    );
    expect(captureErrorMessage(err(409, 'already in that golden set'), 'bad')).toMatch(
      /already saved/,
    );
    expect(captureErrorMessage(err(409, 'the golden set kept changing'), 'bad')).toMatch(
      /changed while you were saving\. Try again/,
    );
    expect(captureErrorMessage(err(422, 'good needs a run that succeeded'), 'good')).toMatch(
      /Only a conversation that succeeded/,
    );
    expect(captureErrorMessage(err(422, 'bad needs a note'), 'bad')).toBe(
      'Say what the assistant should have done.',
    );
    expect(captureErrorMessage(err(422, 'unknown mast label'), 'bad')).toMatch(/another reason/);
    expect(captureErrorMessage(err(422, 'an injection-suite run'), 'bad')).toMatch(/safety tests/);
    expect(captureErrorMessage(err(422, 'input does not match the input schema'), 'bad')).toBe(
      'This conversation does not fit the test cases of that version (input does not match the input schema).',
    );
  });
});
