import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import idMessages from '@/messages/id.json';

export function renderWithMessages(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="id" messages={idMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

export function getMessagesFixture() {
  return idMessages;
}

describe('test helpers', () => {
  it('provider renders children', () => {
    renderWithMessages(<p data-testid="child">ok</p>);
    expect(screen.getByTestId('child').textContent).toBe('ok');
  });
});
