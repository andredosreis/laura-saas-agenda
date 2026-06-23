import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['src/components/admin', 'src/pages/admin'];
const FORBIDDEN = /#(211f1c|f4f1ec|fbf9f6|faf8f4|faf6f1|e8e2da|34302b|f1ece4|ddd5ca|221f1d|3f3a34|9a938c|8f877d|8a827a|a59d93|6f6862|c8c0b6|bd5d33|a14d27|9e2f22|e8cdba|fbf1ea|f0ddcf|f4ebd7|8a610f|b5862f|e7eee4|3f6b3c|f4e0db|efece7|2a2723|161412)/i;

describe('consola admin — sem paleta cream/rust', () => {
  for (const dir of DIRS) {
    const files = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) && !e.name.includes('.test.'));
    for (const f of files) {
      it(`${dir}/${f.name} não contém hex cream/rust`, () => {
        const src = readFileSync(join(dir, f.name), 'utf8');
        const offending = src.split('\n')
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => FORBIDDEN.test(line))
          .map(({ n, line }) => `${n}: ${line.trim()}`);
        expect(offending).toEqual([]);
      });
    }
  }
});
