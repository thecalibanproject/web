import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Drawer } from './drawer';

describe('Drawer', () => {
  afterEach(() => {
    delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  });

  it('gives focus to a field marked data-autofocus once the dialog is open', () => {
    // As a browser does: showModal opens the dialog and focuses its first
    // focusable element, the Close button (jsdom has no showModal).
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
      this.querySelector<HTMLElement>('button')?.focus();
    });
    HTMLDialogElement.prototype.showModal = showModal;

    render(
      <Drawer open onClose={() => {}} title="Search or jump to" side="center">
        <input aria-label="Search" data-autofocus />
      </Drawer>,
    );

    expect(showModal).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus();
  });
});
