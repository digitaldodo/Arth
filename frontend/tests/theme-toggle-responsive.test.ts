import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('responsive theme selector', () => {
  it('uses equal grid tracks, equal-height buttons, and wrapping labels', () => {
    const file = path.resolve(__dirname, '../src/components/ui/ThemeToggle.tsx');
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /grid-cols-2/);
    assert.match(source, /w-full min-w-0/);
    assert.equal((source.match(/min-h-9/g) || []).length, 2, 'both options have the same minimum height');
    assert.equal((source.match(/break-words/g) || []).length, 2, 'both labels can wrap within their half');
    assert.equal((source.match(/justify-center/g) || []).length, 2, 'both label and indicator groups are centered');
  });
});
