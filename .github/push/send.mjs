// Sends IT Quest's daily reminder as a web push to Kingsley's phone.
// Secrets: VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION (JSON from the app's Settings → "Copy code").
import webpush from 'web-push';

const VAPID_PUBLIC = 'BDEySMJf5hxV_a3aAXkKVlkJtSeF4up9tZoSVtb7-pxhUbWXxzfljBWnmAMOe3CIuSme1E9wA4KvRGhUNrm2QR8';
const { VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION, CRON = '', SLOT_OVERRIDE = '' } = process.env;

// Keep in sync with BOSSES in it-quest/index.html
const BOSSES = ['Collision Ogre', 'Kernel Panic', 'The 404 Phantom', 'WannaCry Hydra', 'Packet Wraith', 'Overclock Golem', 'BIOS Basilisk'];

// Each slot has an EST and an EDT cron line; only the one matching New York's current offset sends.
const CRONS = {
  '20 12 * * 0-4': { slot: 'morning', offset: -5 },
  '20 11 * * 0-4': { slot: 'morning', offset: -4 },
  '55 16 * * *': { slot: 'noon', offset: -5 },
  '55 15 * * *': { slot: 'noon', offset: -4 },
};

const now = new Date();
const nyDate = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const nyHour = Number(now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
const utcHour = now.getUTCHours();
let nyOffset = ((nyHour - utcHour + 36) % 24) - 12; // -5 in winter, -4 in summer
const dow = new Date(nyDate + 'T12:00:00Z').getUTCDay(); // 0 = Sunday

let slot = SLOT_OVERRIDE;
if (!slot) {
  const c = CRONS[CRON.trim()];
  if (!c) { console.log(`Unknown schedule "${CRON}", nothing to do.`); process.exit(0); }
  if (c.offset !== nyOffset) { console.log(`Skipping ${c.slot}: this cron is for UTC${c.offset}, New York is UTC${nyOffset}.`); process.exit(0); }
  slot = c.slot;
}

if (!VAPID_PRIVATE_KEY || !PUSH_SUBSCRIPTION) {
  console.log('Missing VAPID_PRIVATE_KEY or PUSH_SUBSCRIPTION secret. Add them in repo Settings → Secrets → Actions.');
  process.exit(0);
}

const [y, m, d] = nyDate.split('-').map(Number);
const boss = BOSSES[Math.floor(Date.UTC(y, m - 1, d) / 86400000) % BOSSES.length];
const dayOff = dow === 5 || dow === 6;
const pick = a => a[Math.floor(Math.random() * a.length)];

const MESSAGES = {
  morning: [
    `☕ Pre-shift run: ${boss} spawned. 5 minutes before you clock in.`,
    `🌅 ${boss} is up early too. Knock it out before 8.`,
    `⚔️ Morning boss: ${boss}. Quick run, then go get that bread.`,
  ],
  noon: dayOff ? [
    `🎮 Day off. Beat ${boss}, then crack open a module.`,
    `🛋️ Off day grind: ${boss} first, Coursera second.`,
    `⚔️ ${boss} doesn't take days off. 5 minutes.`,
  ] : [
    `🍱 Lunch break > doomscrolling. ${boss} is waiting.`,
    `🍔 Eat, then beat ${boss}. 5 minutes, one hand.`,
    `⚔️ Lunch run: ${boss}. Swap this in for one phone game.`,
  ],
  test: [`🧪 Test ping from the reminder server. ${boss} says hi.`],
};

const payload = JSON.stringify({ title: 'IT Quest', body: pick(MESSAGES[slot] || MESSAGES.test), slot, date: nyDate });

webpush.setVapidDetails('https://kingikeee.github.io/SOC-Trainer/it-quest/', VAPID_PUBLIC, VAPID_PRIVATE_KEY.trim());

let subs = JSON.parse(PUSH_SUBSCRIPTION);
if (!Array.isArray(subs)) subs = [subs];

let failed = 0;
for (const sub of subs) {
  try {
    const res = await webpush.sendNotification(sub, payload, { TTL: 3 * 3600, urgency: 'high' });
    console.log(`Sent ${slot} reminder (${res.statusCode}) for ${nyDate}.`);
  } catch (err) {
    failed++;
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.error('This phone\'s subscription expired. Open IT Quest → Settings, copy the code again, and update the PUSH_SUBSCRIPTION secret.');
    } else {
      console.error('Push failed:', err.statusCode, err.body || err.message);
    }
  }
}
if (failed === subs.length) process.exit(1);
