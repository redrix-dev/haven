const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

const SERVICES = [
  "com.supersami.foregroundservice.ForegroundService",
  "com.supersami.foregroundservice.ForegroundServiceTask",
];

function upsertMetaData(application, name, value) {
  application["meta-data"] = (application["meta-data"] ?? []).filter(
    (item) => item?.$?.["android:name"] !== name,
  );
  AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, name, value);
}

function upsertService(application, name) {
  const services = application.service ?? [];
  const existing = services.find((service) => service?.$?.["android:name"] === name);
  const attrs = {
    "android:name": name,
    "android:exported": "false",
    "android:foregroundServiceType": "microphone|mediaPlayback",
  };
  if (existing) {
    existing.$ = { ...existing.$, ...attrs };
  } else {
    services.push({ $: attrs });
  }
  application.service = services;
}

function withAndroidVoiceForegroundService(config) {
  return withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.addPermission(
      cfg.modResults,
      "android.permission.POST_NOTIFICATIONS",
    );
    AndroidConfig.Permissions.addPermission(
      cfg.modResults,
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    );
    AndroidConfig.Permissions.addPermission(
      cfg.modResults,
      "android.permission.FOREGROUND_SERVICE_MICROPHONE",
    );

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    upsertMetaData(
      application,
      "com.supersami.foregroundservice.notification_channel_name",
      "Haven voice",
    );
    upsertMetaData(
      application,
      "com.supersami.foregroundservice.notification_channel_description",
      "Active Haven voice sessions",
    );
    upsertMetaData(
      application,
      "com.supersami.foregroundservice.notification_color",
      "@color/colorPrimary",
    );
    for (const service of SERVICES) {
      upsertService(application, service);
    }

    return cfg;
  });
}

module.exports = withAndroidVoiceForegroundService;
