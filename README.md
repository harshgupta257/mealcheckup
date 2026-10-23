# MealCheckup – daily meal reminder & checklist

A minimalist, iOS Health–style web app (PWA). No backend, no build step: it's plain HTML/CSS/JS.

- **Today**: progress ring + checklist to tick off meals you've eaten
- **Schedule**: set meal names, emoji, times; toggle reminders on/off; add/remove meals
- **History**: last 7 days, streak, weekly %
- **Reminders**: browser notifications (with a "Mark as eaten" action) + "Add to Calendar" `.ics` export for reliable phone alarms
- Works offline, supports dark mode, and installs to your home screen

Data is stored on your device (localStorage).

## Deploy on Vercel
1. Push this folder to a GitHub repo.
2. vercel.com → **Add New → Project** → import the repo.
3. Framework preset: **Other**. Leave build command empty and the output directory as root. Deploy.
   (`vercel.json` is already included: it stops the service worker from being cached so updates reach your phone.)

Or use the CLI: `npm i -g vercel && vercel --prod` from this folder.

## Deploy on Render
Easiest: render.com → **New → Blueprint** → pick this repo. `render.yaml` sets everything up.

Or manually: **New → Static Site** → pick the repo → build command empty → **Publish directory: `.`** → Create.

## Set it up on your phone
**iPhone (iOS 16.4+):** open the URL in Safari → Share → **Add to Home Screen** → open it from the home screen → Schedule → **Enable** notifications.

**Android:** open in Chrome → menu → **Install app / Add to Home screen** → enable notifications.

### Which reminder should I use?
Web apps can't schedule notifications while fully closed (that would need a push server).
So for **guaranteed** reminders, tap **Schedule → Add Reminders to Calendar**. It adds a daily
repeating event with an alert for each meal to your phone's calendar. Re-download it after changing times
(delete the old events first to avoid duplicates). Use the app itself for the checklist and history.

## Run locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000
