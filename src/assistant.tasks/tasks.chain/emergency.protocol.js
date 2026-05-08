import {sendMessageToUser} from "../../bot/telegram.bot.js";
import GetLatestTelemetry from "../../db.tasks/telemetry.data.get.js";

export default async function emergencyProtocol() {
  try {
    const data = await GetLatestTelemetry();
    let message = `🚨 EMERGENCY ALERT

Synchora has detected an emergency trigger from the user.
This message is regarding the user's emergency situation.

`;
    if (!data) {
      message += `❗ Unfortunately, we are unable to connect to the device right now.
We do not have any information about the user's last known location.`;
      await sendMessageToUser(message);
      return;
    }

    const { temperature, humidity, time, location } = data;
    if (location && location.coordinates) {
      const [lng, lat] = location.coordinates;
      const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;
      message += `⚠️ Unable to connect to the device currently.
Here is the last known data from the user:

🕒 Time: ${new Date(time).toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata"
})}
🌡️ Temp: ${temperature} °C
💧 Humidity: ${humidity} %
📍 Last Known Location:
${mapLink}`;
    } else {
      message += `⚠️ Unable to connect to the device currently.
We do not have any information about the user's last known location.`;
    }
    await sendMessageToUser(message);
  } catch (error) {
    console.error("EmergencyProtocol error:", error.message);
  }
}