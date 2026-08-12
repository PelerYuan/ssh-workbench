import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SshSource } from '../types';
import { SessionDialog } from './SessionDialog';
import { SourceDialog } from './SourceDialog';
import { VirtualKeys } from './VirtualKeys';

const source: SshSource = {
  id: 'source-1',
  name: 'Home server',
  host: '192.168.1.101',
  port: 22,
  username: 'peler',
  authType: 'privateKey',
  hasPassword: false,
  hasPrivateKey: true,
  hasPassphrase: true,
  hostFingerprint: null,
  createdAt: 1,
  updatedAt: 1,
};

function tags(markup: string, tagName: string): string[] {
  return markup.match(new RegExp(`<${tagName}\\b[^>]*>`, 'g')) ?? [];
}

describe('unavailable terminal controls', () => {
  it('disables every virtual key and suppresses stale modifier presentation', () => {
    const markup = renderToStaticMarkup(
      <VirtualKeys ctrl alt disabled onModifier={vi.fn()} onData={vi.fn()} />,
    );
    const buttons = tags(markup, 'button');

    expect(buttons).toHaveLength(14);
    expect(buttons.every((button) => button.includes('disabled=""'))).toBe(true);
    expect(markup).not.toContain('is-active');
    expect(markup).not.toContain('aria-pressed="true"');
  });
});

describe('pending dialog controls', () => {
  it('locks every editable SSH source control while saving', () => {
    const markup = renderToStaticMarkup(
      <SourceDialog source={source} saving error="" onClose={vi.fn()} onSave={vi.fn()} />,
    );
    const editableTags = [
      ...tags(markup, 'input'),
      ...tags(markup, 'textarea'),
      ...tags(markup, 'select'),
    ];
    const authButtons = tags(markup, 'button').filter((button) => button.includes('aria-pressed'));

    expect(editableTags).not.toHaveLength(0);
    expect(editableTags.every((tag) => tag.includes('disabled=""'))).toBe(true);
    expect(authButtons).toHaveLength(2);
    expect(authButtons.every((button) => button.includes('disabled=""'))).toBe(true);
  });

  it('locks source and title fields while creating a session', () => {
    const markup = renderToStaticMarkup(
      <SessionDialog sources={[source]} creating error="" onClose={vi.fn()} onCreate={vi.fn()} />,
    );
    const editableTags = [...tags(markup, 'select'), ...tags(markup, 'input')];

    expect(editableTags).toHaveLength(2);
    expect(editableTags.every((tag) => tag.includes('disabled=""'))).toBe(true);
  });
});
