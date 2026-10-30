import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(':memory:');
const calls = [];
const failures = new Map();
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
    const result = database.prepare(text).run(...params);
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
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

export function callsOf(method) {
  return calls.filter((entry) => entry.method === method);
}

export const api = {
  async getMe() {
    record('getMe', {});
    return { id: 1, is_bot: true, first_name: 'Test', username: 'test_bot' };
  },
  async sendMessage(args) {
    record('sendMessage', args);
    return { message_id: nextId++, chat: { id: args.chat_id }, text: args.text };
  },
  async copyMessage(args) {
    record('copyMessage', args);
    return { message_id: nextId++, chat: { id: args.chat_id } };
  },
  async copyMessages(args) {
    record('copyMessages', args);
    return args.message_ids.map(() => ({ message_id: nextId++ }));
  },
  async forwardMessage(args) {
    record('forwardMessage', args);
    return { message_id: nextId++, chat: { id: args.chat_id } };
  },
  async forwardMessages(args) {
    record('forwardMessages', args);
    return args.message_ids.map(() => ({ message_id: nextId++ }));
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
