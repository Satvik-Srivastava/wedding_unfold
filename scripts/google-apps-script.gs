function doPost(event) {
  try {
    var properties = PropertiesService.getScriptProperties();
    var expectedSecret = properties.getProperty("SHARED_SECRET");
    var recipient = properties.getProperty("RECIPIENT_EMAIL");

    if (!expectedSecret || !recipient) {
      return jsonResponse({ sent: false, error: "Email delivery is not configured." });
    }

    var rawBody = event && event.postData && event.postData.contents;
    if (typeof rawBody !== "string" || rawBody.length > 12000) {
      return jsonResponse({ sent: false, error: "Invalid request." });
    }

    var payload = JSON.parse(rawBody);
    if (!payload || payload.secret !== expectedSecret) {
      return jsonResponse({ sent: false, error: "Unauthorized request." });
    }

    var name = typeof payload.name === "string" ? payload.name.trim() : "";
    var note = typeof payload.note === "string" ? payload.note.trim() : "";
    var guests = Number(payload.guests);
    var events = Array.isArray(payload.events)
      ? payload.events.filter(function (name) { return typeof name === "string" && name.trim(); })
      : [];

    if (!name || name.length > 100 || note.length > 1000 || events.length === 0 ||
        events.length > 10 || !Number.isInteger(guests) || guests < 1 || guests > 12) {
      return jsonResponse({ sent: false, error: "Invalid greeting details." });
    }

    var received = Utilities.formatDate(new Date(), "Asia/Kolkata", "dd MMM yyyy, hh:mm a");
    var body = [
      "A new greeting has been sent from your wedding invitation.",
      "",
      "Name: " + name,
      "Celebrations: " + events.join(", "),
      "Number attending: " + guests,
      "Note: " + (note || "(no note included)"),
      "Received: " + received + " (India Standard Time)"
    ].join("\n");

    MailApp.sendEmail({
      to: recipient,
      subject: "Wedding greeting from " + name.replace(/[\r\n]/g, " ").slice(0, 100),
      body: body,
      name: "Wedding invitation"
    });

    return jsonResponse({ sent: true });
  } catch (error) {
    console.error("Could not send wedding greeting:", error);
    return jsonResponse({ sent: false, error: "Email delivery failed." });
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
