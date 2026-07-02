import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDir = join(root, 'supabase/migrations');
const typesPath = join(root, 'src/lib/database.types.ts');

// Concatena tutte le migration, rimuovendo i commenti di riga (-- ...)
function loadMigrationsSql(): string {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return files
    .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
    .join('\n')
    .replace(/--[^\n]*/g, '');
}

// Estrae { tabella -> colonne } dalle CREATE TABLE (parentesi bilanciate)
function extractCreateTables(sql: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /create\s+table\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const table = m[1];
    let i = re.lastIndex - 1; // posizione della '('
    const start = i;
    let depth = 0;
    for (; i < sql.length; i++) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    out[table] = extractColumns(sql.slice(start + 1, i));
  }
  return out;
}

function extractColumns(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of body) {
    if (c === '(') { depth++; cur += c; }
    else if (c === ')') { depth--; cur += c; }
    else if (c === ',' && depth === 0) { parts.push(cur); cur = ''; }
    else cur += c;
  }
  if (cur.trim()) parts.push(cur);

  const constraintKw = /^(primary|foreign|unique|check|constraint|exclude)\b/i;
  const cols: string[] = [];
  for (const raw of parts) {
    const line = raw.trim();
    if (!line || constraintKw.test(line)) continue;
    const name = line.split(/\s+/)[0].replace(/"/g, '');
    if (/^[a-z_][a-z0-9_]*$/i.test(name)) cols.push(name);
  }
  return cols;
}

// Estrae [tabella, colonna] dalle ALTER TABLE ... ADD COLUMN
function extractAddColumns(sql: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re =
    /alter\s+table\s+([a-z_][a-z0-9_]*)\s+add\s+column\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) out.push([m[1], m[2]]);
  return out;
}

// Estrae il blocco di una tabella dai tipi generati (graffe bilanciate)
function typeTableBlock(types: string, table: string): string {
  const re = new RegExp(`\\n\\s*${table}: \\{`);
  const m = re.exec(types);
  if (!m) return '';
  let i = types.indexOf('{', m.index);
  let depth = 0;
  for (; i < types.length; i++) {
    if (types[i] === '{') depth++;
    else if (types[i] === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return types.slice(m.index, i);
}

describe('schema SQL ↔ database.types.ts', () => {
  const sql = loadMigrationsSql();
  const tables = extractCreateTables(sql);
  const added = extractAddColumns(sql);
  const types = readFileSync(typesPath, 'utf8');

  // Mappa attesa: colonne da CREATE TABLE + ADD COLUMN
  const expected: Record<string, Set<string>> = {};
  for (const [t, cols] of Object.entries(tables)) {
    expected[t] = new Set(cols);
  }
  for (const [t, c] of added) {
    (expected[t] ??= new Set()).add(c);
  }

  // Sanity: il parser ha trovato qualcosa (niente falsi verdi)
  it('parsa almeno 6 tabelle dalle migration', () => {
    expect(Object.keys(expected).length).toBeGreaterThanOrEqual(6);
  });

  it('parsa un numero plausibile di colonne', () => {
    const total = Object.values(expected).reduce((n, s) => n + s.size, 0);
    expect(total).toBeGreaterThanOrEqual(30);
  });

  // Ogni colonna dichiarata nelle migration è presente nei tipi, tabella giusta
  for (const [table, cols] of Object.entries(expected)) {
    const block = typeTableBlock(types, table);
    it(`i tipi contengono la tabella ${table}`, () => {
      expect(block, `tabella ${table} assente in database.types.ts`).not.toBe('');
    });
    for (const col of cols) {
      it(`${table}.${col} è presente in database.types.ts`, () => {
        const re = new RegExp(`\\b${col}: `);
        expect(re.test(block), `colonna ${table}.${col} assente nei tipi`).toBe(true);
      });
    }
  }
});
