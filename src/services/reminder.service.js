import ScheduleMemory from "../model/schedule.model.js";
import { sendMessageToUser } from "../bot/telegram.bot.js";
import createLogger from "../utils/logger.js";

const log = createLogger("REMINDER");

// Track which reminder IDs have already been fired this session
const firedReminders = new Set();

/**
 * Checks for upcoming schedule events in the next 5 minutes.
 * Fires a Telegram notification and optionally speaks via TTS on the device.
 *
 * @param {Function|null} ttsCallback - Optional async fn(text, socket) to speak on device
 * @param {Object|null} socket - Active WebSocket connection to the device
 */
async function checkAndFireReminders(ttsCallback = null, socket = null) {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 60 * 1000);        // 1 min ago (buffer)
    const windowEnd   = new Date(now.getTime() + 5 * 60 * 1000);    // 5 mins ahead

    const upcoming = await ScheduleMemory.find({
      time_event: { $gte: windowStart, $lte: windowEnd }
    }).lean();

    for (const event of upcoming) {
      const id = event._id.toString();

      // Skip already-fired reminders
      if (firedReminders.has(id)) continue;
      firedReminders.add(id);

      const eventTime = new Date(event.time_event).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        timeStyle: "short",
        dateStyle: "medium"
      });

      const reminderText = `Reminder: ${event.description_event} at ${eventTime}.`;
      log.info(`Firing reminder: "${reminderText}"`);

      // Telegram notification
      try {
        await sendMessageToUser(`🔔 Synchora Reminder\n\n${reminderText}`);
      } catch (e) {
        log.warn("Telegram reminder notification failed:", e.message);
      }

      // Device TTS announcement (if a live WebSocket is available)
      if (ttsCallback && socket && socket.readyState === 1) {
        try {
          await ttsCallback(reminderText, socket);
        } catch (e) {
          log.warn("TTS reminder announcement failed:", e.message);
        }
      }
    }
  } catch (err) {
    log.error("Reminder check error:", err.message);
  }
}

/**
 * Starts the reminder polling loop.
 * Checks every 60 seconds for events due in the next 5 minutes.
 *
 * @param {Function|null} ttsCallback - async fn(text, socket) for device TTS
 * @param {Function} getActiveSocket - fn() that returns the current active WebSocket or null
 */
export function startReminderService(ttsCallback = null, getActiveSocket = () => null) {
  log.info("Reminder service started — polling every 60 seconds");

  // Run immediately on start, then every 60 seconds
  const tick = () => {
    const socket = getActiveSocket();
    checkAndFireReminders(ttsCallback, socket);
  };

  tick();
  setInterval(tick, 60 * 1000);
}
