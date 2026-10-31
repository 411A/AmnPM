export function sql(strings, ...values) {
  let text = '';
  const params = [];
  for (let i = 0; i < strings.length; i += 1) {
    text += strings[i];
    if (i >= values.length) continue;
    const value = values[i];
    if (value && typeof value === 'object' && '__raw' in value) text += value.__raw;
    else if (value && typeof value === 'object' && 'text' in value && Array.isArray(value.params)) {
      text += value.text;
      params.push(...value.params);
    } else {
      text += '?';
      params.push(value);
    }
  }
  return { text, params };
}

sql.raw = (text) => ({ __raw: text });

class Column {
  constructor(name, type) {
    this.name = name;
    this.type = type;
    this.isPrimary = false;
    this.isAuto = false;
    this.isNotNull = false;
    this.defaultValue = undefined;
  }

  primaryKey(options = {}) {
    this.isPrimary = true;
    this.isAuto = Boolean(options.autoIncrement);
    return this;
  }

  notNull() {
    this.isNotNull = true;
    return this;
  }

  default(value) {
    this.defaultValue = value;
    return this;
  }
}

class Index {
  constructor(name, isUnique) {
    this.name = name;
    this.isUnique = isUnique;
    this.columns = [];
  }

  on(...columns) {
    this.columns = columns.map((c) => (typeof c === 'string' ? c : c.name));
    return this;
  }
}

export const integer = (name) => new Column(name, 'INTEGER');
export const text = (name) => new Column(name, 'TEXT');
export const index = (name) => new Index(name, false);
export const uniqueIndex = (name) => new Index(name, true);

export function table(name, columns, indexes = () => []) {
  return { name, columns, indexes };
}

function literal(value) {
  return typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
}

export function applySchema(tables, runner) {
  for (const item of tables) {
    if (!item || !item.name || !item.columns) continue;
    const columns = Object.values(item.columns).map((column) => {
      let line = `${column.name} ${column.type}`;
      if (column.isPrimary) line += ' PRIMARY KEY';
      if (column.isAuto) line += ' AUTOINCREMENT';
      if (column.isNotNull && !column.isPrimary) line += ' NOT NULL';
      if (column.defaultValue !== undefined) line += ` DEFAULT ${literal(column.defaultValue)}`;
      return line;
    });
    runner(`CREATE TABLE IF NOT EXISTS ${item.name} (${columns.join(', ')})`);
    for (const entry of item.indexes(item.columns)) {
      runner(
        `CREATE ${entry.isUnique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${entry.name} ` +
          `ON ${item.name} (${entry.columns.join(', ')})`,
      );
    }
  }
}
