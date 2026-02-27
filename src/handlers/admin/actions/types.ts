import type { Context } from "telegraf";

export type AdminBot = {
  command: (name: string, handler: (ctx: Context) => Promise<unknown>) => void;
  action: (pattern: string | RegExp, handler: (ctx: Context) => Promise<unknown>) => void;
};
