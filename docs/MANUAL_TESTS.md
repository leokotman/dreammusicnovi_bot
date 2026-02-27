# Manual test checklist — DreamMusic Bot

Use this list to verify the bot after changes. Test as a **regular user** and (where marked) as **teacher** (account with `TEACHER_USER_ID`). Button labels and in-bot text are in Russian.

---

## 1. Commands

| # | Action | Expected |
|---|--------|----------|
| 1.1 | Send `/start` | Main menu with 3 buttons: Об уроках, Задать вопрос, Связаться с преподавателем. |
| 1.2 | Send `/help` | Same main menu plus short help text. |
| 1.3 | Send any other text (e.g. "hello") | Reply with “Используйте меню ниже…” (or similar) and main menu. |

---

## 2. Main menu and navigation

| # | Action | Expected |
|---|--------|----------|
| 2.1 | Tap **Об уроках** | Lessons list: 5 topics + “◀️ В главное меню”. |
| 2.2 | Tap **В главное меню** (from lessons list) | Back to main menu. |
| 2.3 | Tap **Задать вопрос** | Ask list: 4 FAQ + “Задать свой вопрос” + “◀️ В главное меню”. |
| 2.4 | Tap **В главное меню** (from ask list) | Back to main menu. |
| 2.5 | Tap **Связаться с преподавателем** | Contact block: Telegram, Instagram, email + “◀️ Назад”. |
| 2.6 | Tap **◀️ Назад** (from contact) | Back to main menu. |

---

## 3. Lessons (Об уроках)

| # | Action | Expected |
|---|--------|----------|
| 3.1 | Об уроках → tap **Стоимость** | Price text (HTML) + topic buttons + “◀️ Назад”. |
| 3.2 | Tap **◀️ Назад** (from a topic) | Back to lessons list (5 topics + В главное меню). |
| 3.3 | Open **Как проходят занятия** | Correct text and “◀️ Назад”. |
| 3.4 | Open **Вокал** | Correct text and “◀️ Назад”. |
| 3.5 | Open **Фортепиано** | Correct text and “◀️ Назад”. |
| 3.6 | Open **Упражнения между занятиями** | Correct text and “◀️ Назад”. |
| 3.7 | On any topic, tap the **same topic** again (e.g. Вокал twice) | No error; message may stay the same (no “Произошла ошибка”). |

---

## 4. Ask a question (Задать вопрос)

| # | Action | Expected |
|---|--------|----------|
| 4.1 | Задать вопрос → tap **Я уже слишком взрослый?** | FAQ answer + “◀️ Назад”. |
| 4.2 | Tap **◀️ Назад** (from FAQ answer) | Back to ask list (4 FAQ + Задать свой вопрос + В главное меню). |
| 4.3 | Open each of the other 3 FAQ questions | Each shows the right answer and “◀️ Назад”. |
| 4.4 | Tap **✏️ Задать свой вопрос** | Message: “Отправьте ваш вопрос в следующем сообщении…” (or similar) + “◀️ Назад к меню”. |
| 4.5 | Send a text message (e.g. “Когда можно начать?”) | Reply: “Ваш вопрос отправлен преподавателю…” (or similar) + main menu. |
| 4.6 | (If `TEACHER_CHAT_ID` is set) Check teacher chat | Same question appears: “Новый вопрос от … :” + your text. |
| 4.7 | Tap **◀️ Назад к меню** (from “Задать свой вопрос” screen) | Back to main menu. |

---

## 5. Contact

| # | Action | Expected |
|---|--------|----------|
| 5.1 | Связаться с преподавателем | Links for Telegram, Instagram and email are shown and clickable. |
| 5.2 | Tap **◀️ Назад** | Back to main menu. |

---

## 6. Admin (teacher and dev)

Use an account whose ID is in `TEACHER_USER_ID` or `DEV_ID`. Only `TEACHER_CHAT_ID` receives forwarded “ask your question” messages; dev does not.

| # | Action | Expected |
|---|--------|----------|
| 6.1 | Send `/admin` | Reply with clickable admin menu (edit “Об уроках” / “Задать вопрос”). |
| 6.2 | Use admin menu to edit a lesson (e.g. Стоимость) | Bot asks to send new content and shows current text. |
| 6.3 | Send new text (e.g. “<b>Новая цена</b>”) | Reply like “Раздел «price» обновлён.” (or similar). |
| 6.4 | Open Об уроках → Стоимость | Updated “price” content is shown. |
| 6.5 | Use admin menu to edit a FAQ (e.g. amITooOld) | Bot asks for new content. |
| 6.6 | Send new text | Reply like “Ответ «amITooOld» обновлён.” (or similar). |
| 6.7 | Задать вопрос → Я уже слишком взрослый? | Updated FAQ answer is shown. |
| 6.8 | (Optional) Check `data/overrides.json` | File exists and contains your overrides. |

**Non-admin:** From an account that is not in `TEACHER_USER_ID` or `DEV_ID`, send `/admin` or try to edit. Bot does nothing (no reply).

**BotFather:** If `/admin` is set with scope “Group administrators”, it only appears in groups. For the teacher to see `/admin` in a 1:1 chat: BotFather → Set Commands → scope **Default** (private chats) → add `admin - Админ`. The bot still only responds to `/admin` for admins.

---

## 7. Rate limit

| # | Action | Expected |
|---|--------|----------|
| 7.1 | Send 5+ text messages within 1 minute (e.g. “a”, “b”, “c”, “d”, “e”) | After the 5th (or 6th), reply like “Слишком много сообщений. Подождите минуту…” (or similar). |
| 7.2 | Tap only buttons (no text) many times | No rate limit; navigation works. |
| 7.3 | Wait ~1 minute, send text again | Normal reply (menu or “question sent”). |

---

## 8. Edge cases

| # | Action | Expected |
|---|--------|----------|
| 8.1 | Tap the same menu button twice in a row (e.g. Об уроках twice) | No crash; no “Произошла ошибка” to user. |
| 8.2 | After “Задать свой вопрос”, send a message | Question is forwarded (if `TEACHER_CHAT_ID` set) and thank-you message is shown; no duplicate sends. |
| 8.3 | Send a very long message as “your question” | Forwarded as-is (or truncated by Telegram); no crash. |
| 8.4 | **Restart:** Stop the server (Ctrl+C), run `npm run dev` again, then in Telegram send `/start` | Main menu appears with current content (and overrides if any). |

---

## Quick smoke test (minimal)

1. `/start` → main menu.
2. Об уроках → Вокал → Назад → В главное меню.
3. Задать вопрос → Задать свой вопрос → send “Test” → see thank-you (and teacher gets it if configured).
4. Связаться с преподавателем → Назад.
5. (Teacher) `/admin` → see admin menu.
