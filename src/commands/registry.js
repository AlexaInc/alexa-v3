"use strict";
const analytics = require("../services/analytics");

class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
  }
  register(definition) {
    const name = String(definition.name || "").toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(name) || typeof definition.execute !== "function")
      throw new Error(`Invalid command: ${name}`);
    if (this.resolve(name)) throw new Error(`Duplicate command: ${name}`);
    const command = Object.freeze({
      aliases: [],
      category: "general",
      roles: ["everyone"],
      cooldown: 0,
      ...definition,
      name,
    });
    this.commands.set(name, command);
    for (const alias of command.aliases) {
      const key = String(alias).toLowerCase();
      if (this.resolve(key)) throw new Error(`Duplicate alias: ${key}`);
      this.aliases.set(key, name);
    }
    return command;
  }
  resolve(name) {
    const key = String(name || "").toLowerCase();
    return this.commands.get(key) || this.commands.get(this.aliases.get(key));
  }
  list() {
    return [...this.commands.values()].map(
      ({ execute, ...metadata }) => metadata,
    );
  }
  async dispatch(name, context) {
    const command = this.resolve(name);
    if (!command) return { handled: false };
    return { handled: true, result: await command.execute(context) };
  }
  observe(name, context = {}) {
    return analytics.record({
      command: name,
      groupId: context.groupId,
      userId: context.userId,
      status: "received",
    });
  }
}
module.exports = new CommandRegistry();
module.exports.CommandRegistry = CommandRegistry;
