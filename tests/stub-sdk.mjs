import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(':memory:');
const calls = [];
const failures = new Map();
const shorts = new Map();
let nextId = 100;

function wrap(query) {
  if (query && typeof query === 'object' && 'text' in query) return query;
  return { text: String(query), params: [] };
}

function assertRead(text) {
  if (/^\s*(insert|update|delete|replace|create|alter|drop|vacuum|pragma)\b/i.test(text)) {
    throw new Error('Read query looks like a write one');
  }
}

export const db = {
  async run(query) {
    const { text, params } = wrap(query);
    if (/\breturning\b/i.test(text)) {
      const rows = database.prepare(text).all(...params);
      return { rowsAffected: rows.length, lastInsertRowid: 0, rows };
    }
    const result = database.prepare(text).run(...params);
    return { rowsAffected: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid), rows: [] };
  },
  async get(query) {
    const { text, params } = wrap(query);
    assertRead(text);
    return database.prepare(text).get(...params);
  },
  async all(query) {
    const { text, params } = wrap(query);
    assertRead(text);
    return database.prepare(text).all(...params);
  },
};

export function rawDb() {
  return database;
}

export function resetDb() {
  const tables = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();
  for (const { name } of tables) database.prepare(`DROP TABLE IF EXISTS ${name}`).run();
  calls.length = 0;
  failures.clear();
  shorts.clear();
  nextId = 100;
}

function record(method, args) {
  const queued = failures.get(method);
  if (queued && queued.length) throw queued.shift();
  calls.push({ method, args });
}

export function failNext(method, error) {
  if (!failures.has(method)) failures.set(method, []);
  failures.get(method).push(error);
}

// Return only the first N results once, to simulate a partial album copy.
export function shortNext(method, count) {
  shorts.set(method, count);
}

function takeShort(method, length) {
  if (!shorts.has(method)) return null;
  const count = shorts.get(method);
  shorts.delete(method);
  return Math.max(0, Math.min(length, count));
}

export function callsOf(method) {
  return calls.filter((entry) => entry.method === method);
}

export class InputFile {
  constructor(bytes, name, options = {}) {
    this.bytes = bytes;
    this.name = name;
    this.type = options.type;
  }
}

export const api = {
  async getMe() {
    record('getMe', {});
    return { id: 1, is_bot: true, first_name: 'Test', username: 'test_bot' };
  },
  async setMyName(args) {
    record('setMyName', args);
    return true;
  },
  async setMyCommands(args) {
    record('setMyCommands', args);
    return true;
  },
  async setMyDescription(args) {
    record('setMyDescription', args);
    return true;
  },
  async setMyShortDescription(args) {
    record('setMyShortDescription', args);
    return true;
  },
  async setChatMenuButton(args) {
    record('setChatMenuButton', args);
    return true;
  },
  async setMyProfilePhoto(args) {
    record('setMyProfilePhoto', args);
    return true;
  },
  async sendMessage(args) {
    record('sendMessage', args);
    return { message_id: nextId++, chat: { id: args.chat_id }, text: args.text };
  },
  async sendDocument(args) {
    record('sendDocument', args);
    return {
      message_id: nextId++,
      chat: { id: args.chat_id },
      document: { file_name: args.document?.name, mime_type: args.document?.type },
    };
  },
  async sendRichMessage(args) {
    record('sendRichMessage', args);
    return { message_id: nextId++, chat: { id: args.chat_id }, rich_message: args.rich_message };
  },
  async copyMessage(args) {
    record('copyMessage', args);
    return { message_id: nextId++, chat: { id: args.chat_id } };
  },
  async copyMessages(args) {
    record('copyMessages', args);
    const limited = takeShort('copyMessages', args.message_ids.length);
    const ids = limited == null ? args.message_ids : args.message_ids.slice(0, limited);
    return ids.map(() => ({ message_id: nextId++ }));
  },
  async forwardMessage(args) {
    record('forwardMessage', args);
    return { message_id: nextId++, chat: { id: args.chat_id } };
  },
  async forwardMessages(args) {
    record('forwardMessages', args);
    const limited = takeShort('forwardMessages', args.message_ids.length);
    const ids = limited == null ? args.message_ids : args.message_ids.slice(0, limited);
    return ids.map(() => ({ message_id: nextId++ }));
  },
  async createForumTopic(args) {
    record('createForumTopic', args);
    return { message_thread_id: nextId++, name: args.name };
  },
  async editForumTopic(args) {
    record('editForumTopic', args);
    return true;
  },
  async closeForumTopic(args) {
    record('closeForumTopic', args);
    return true;
  },
  async editMessageReplyMarkup(args) {
    record('editMessageReplyMarkup', args);
    return true;
  },
  async editMessageText(args) {
    record('editMessageText', args);
    return true;
  },
  async setMessageReaction(args) {
    record('setMessageReaction', args);
    return true;
  },
  async deleteMessage(args) {
    record('deleteMessage', args);
    return true;
  },
  async answerCallbackQuery(args) {
    record('answerCallbackQuery', args);
    return true;
  },
};
