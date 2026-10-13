import { ApiError } from '@/api/client';

export const MAX_NOTE = 4000;

export type Verdict = 'good' | 'bad';

/** A plain message for each refusal of `POST .../runs/{id}/golden-case`. */
export function captureErrorMessage(error: unknown, verdict: Verdict): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : String(error);
  const detail = error.message ? ` (${error.message})` : '';
  switch (error.status) {
    case 404:
      return 'This conversation no longer exists in this workspace, or its version was deleted.';
    case 409:
      if (/already/i.test(error.message)) {
        return 'This conversation is already saved as a test case of that version.';
      }
      if (/finish|not ended|running|waiting/i.test(error.message)) {
        return 'The conversation has not finished yet. Save it once it ends.';
      }
      return `The test cases changed while you were saving. Try again.${detail}`;
    case 422:
      if (verdict === 'good' && /succeed/i.test(error.message)) {
        return 'Only a conversation that succeeded can be saved as a right answer. Save it as a wrong answer instead.';
      }
      if (/note/i.test(error.message)) return 'Say what the assistant should have done.';
      if (/label/i.test(error.message)) return 'Pick another reason from the list, or none.';
      if (/injection/i.test(error.message)) {
        return 'Conversations from safety tests cannot be saved as test cases.';
      }
      return `This conversation does not fit the test cases of that version${detail}.`;
    case 403:
      return 'Your role cannot change test cases on this workspace (needs nodes.write).';
    default:
      return error.message;
  }
}
