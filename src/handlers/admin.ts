import type { Context } from "telegraf";
import { env } from "../config/env";
import { loadAdmins, hasAnyAdmin } from "../config/admins";
import {
  registerAdminMain,
  registerAdminSections,
  registerAdminSectionSub,
  registerAdminLessons,
  registerAdminFaq,
  registerAdminCommands,
} from "./admin/actions";

export function registerAdmin(bot: {
  command: (name: string, handler: (ctx: Context) => Promise<unknown>) => void;
  action: (pattern: string | RegExp, handler: (ctx: Context) => Promise<unknown>) => void;
}) {
  const envAdminIds = [
    env.TEACHER_USER_ID,
    env.DEV_ID,
    ...env.ADMIN_IDS,
  ].filter((id): id is string => typeof id === "string");
  loadAdmins(envAdminIds);
  if (!hasAnyAdmin()) return;

  registerAdminMain(bot);
  registerAdminSections(bot);
  registerAdminSectionSub(bot);
  registerAdminLessons(bot);
  registerAdminFaq(bot);
  registerAdminCommands(bot);
}

export { handleAdminEdit } from "./admin/edit";
