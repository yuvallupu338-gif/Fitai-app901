import pg from 'pg';
import { config as loadEnv } from 'dotenv';

// טוען קודם ‎.env.local‎ (כמו Next.js) ואחר כך ‎.env‎ כגיבוי.
loadEnv({ path: '.env.local' });
loadEnv();
import { writeFileSync } from 'node:fs';

const connectionString = process.env.SUPABASE_DB_URL;
const client = new pg.Client({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString ?? '') ? false : { rejectUnauthorized: false },
});
await client.connect();

const { rows: enums } = await client.query(`
  select t.typname as name, array_to_json(array_agg(e.enumlabel order by e.enumsortorder)) as labels
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  group by t.typname order by t.typname;
`);

const { rows: cols } = await client.query(`
  select c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable,
         c.column_default, c.is_generated, c.identity_generation
  from information_schema.columns c
  join information_schema.tables t
    on t.table_name = c.table_name and t.table_schema = c.table_schema
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
  order by c.table_name, c.ordinal_position;
`);

const { rows: fns } = await client.query(`
  select p.proname as name
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
  group by p.proname order by p.proname;
`);

// מפתחות זרים – נדרשים כדי ש־supabase-js יוכל להסיק טיפוסים לשאילתות מקוננות.
const { rows: fkeys } = await client.query(`
  select
    con.conname                                     as name,
    cl.relname                                      as table_name,
    fcl.relname                                     as referenced_relation,
    (select array_to_json(array_agg(att.attname::text order by u.ord))
       from unnest(con.conkey) with ordinality u(attnum, ord)
       join pg_attribute att on att.attrelid = cl.oid and att.attnum = u.attnum) as columns,
    (select array_to_json(array_agg(att.attname::text order by u.ord))
       from unnest(con.confkey) with ordinality u(attnum, ord)
       join pg_attribute att on att.attrelid = fcl.oid and att.attnum = u.attnum) as referenced_columns,
    exists (
      select 1 from pg_index i
      where i.indrelid = cl.oid
        and i.indisunique
        and i.indnatts = array_length(con.conkey, 1)
        and (i.indkey::int2[])[0:array_length(con.conkey,1)-1] @> con.conkey
    ) as is_one_to_one
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  join pg_class fcl on fcl.oid = con.confrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where con.contype = 'f' and n.nspname = 'public'
  order by cl.relname, con.conname;
`);

const relByTable = new Map();
for (const fk of fkeys) {
  if (!relByTable.has(fk.table_name)) relByTable.set(fk.table_name, []);
  relByTable.get(fk.table_name).push(fk);
}

const enumNames = new Set(enums.map((e) => e.name));

function tsType(col) {
  const udt = col.udt_name;
  if (udt.startsWith('_')) {
    const inner = tsType({ ...col, udt_name: udt.slice(1), data_type: 'x' });
    return `${inner}[]`;
  }
  if (enumNames.has(udt)) return `Database["public"]["Enums"]["${udt}"]`;
  switch (udt) {
    case 'uuid': case 'text': case 'citext': case 'varchar': case 'bpchar':
    case 'timestamptz': case 'timestamp': case 'date': case 'time': case 'timetz':
    case 'interval': case 'inet':
      return 'string';
    case 'int2': case 'int4': case 'int8': case 'numeric': case 'float4': case 'float8':
      return 'number';
    case 'bool': return 'boolean';
    case 'json': case 'jsonb': return 'Json';
    default: return 'unknown';
  }
}

const byTable = new Map();
for (const c of cols) {
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, []);
  byTable.get(c.table_name).push(c);
}

let out = `// ============================================================
// טיפוסי מסד הנתונים – נוצרו אוטומטית מהסכימה (supabase/migrations).
// אין לערוך ידנית. ליצירה מחדש: npm run db:types
// ============================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
`;

for (const [table, columns] of [...byTable.entries()].sort()) {
  out += `      ${table}: {\n        Row: {\n`;
  for (const c of columns) {
    out += `          ${c.column_name}: ${tsType(c)}${c.is_nullable === 'YES' ? ' | null' : ''};\n`;
  }
  out += `        };\n        Insert: {\n`;
  for (const c of columns) {
    if (c.is_generated === 'ALWAYS' || c.identity_generation) continue;
    const optional = c.is_nullable === 'YES' || c.column_default !== null;
    out += `          ${c.column_name}${optional ? '?' : ''}: ${tsType(c)}${c.is_nullable === 'YES' ? ' | null' : ''};\n`;
  }
  out += `        };\n        Update: {\n`;
  for (const c of columns) {
    if (c.is_generated === 'ALWAYS' || c.identity_generation) continue;
    out += `          ${c.column_name}?: ${tsType(c)}${c.is_nullable === 'YES' ? ' | null' : ''};\n`;
  }
  out += `        };\n        Relationships: [\n`;
  for (const fk of relByTable.get(table) ?? []) {
    out += `          {\n`;
    out += `            foreignKeyName: ${JSON.stringify(fk.name)};\n`;
    out += `            columns: [${fk.columns.map((c) => JSON.stringify(c)).join(', ')}];\n`;
    out += `            isOneToOne: ${fk.is_one_to_one ? 'true' : 'false'};\n`;
    out += `            referencedRelation: ${JSON.stringify(fk.referenced_relation)};\n`;
    out += `            referencedColumns: [${fk.referenced_columns.map((c) => JSON.stringify(c)).join(', ')}];\n`;
    out += `          },\n`;
  }
  out += `        ];\n      };\n`;
}

out += `    };
    Views: Record<string, never>;
    Functions: {
`;
for (const f of fns) {
  out += `      ${f.name}: { Args: Record<string, unknown>; Returns: unknown };\n`;
}
out += `    };
    Enums: {
`;
for (const e of enums) {
  out += `      ${e.name}: ${e.labels.map((l) => JSON.stringify(l)).join(' | ')};\n`;
}
out += `    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
`;

writeFileSync(process.argv[2], out);
await client.end();
console.log('wrote', process.argv[2], out.split('\n').length, 'lines');
