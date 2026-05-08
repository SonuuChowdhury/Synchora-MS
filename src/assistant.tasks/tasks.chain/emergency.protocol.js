import { sendMessageToUser } from "../../bot/telegram.bot.js";
import GetLatestTelemetry from "../../db.tasks/telemetry.data.get.js";
import geoLocation from "../../json/geoLocation.json" with { type: "json" };

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

    let lat, lng;

    // Step 1: Check if hardcoding is allowed
    if (geoLocation.isHardcodingAllowed) {

      // Step 2: Choose Home or Work coordinates
      if (geoLocation.isHome) {
        lat = geoLocation.HomeLatitude;
        lng = geoLocation.HomeLongitude;
      } else {
        lat = geoLocation.WorkLatitude;
        lng = geoLocation.WorkLongitude;
      }

    } else if (location && location.coordinates) {

      // Use live telemetry coordinates
      [lng, lat] = location.coordinates;
    }

    // Step 3: Send message with coordinates
    if (lat && lng) {
      const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;

      message += `⚠️ Unable to connect to the device currently.
Here is the last known data from the user:

🕒 Time: ${new Date(time).toLocaleString("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "medium"
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