package com.amaya.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Notification channels: a loud one for orders, a normal one for everything else. */
final class Alerts {
    static final String CH_ORDERS = "amaya_orders";
    static final String CH_GENERAL = "amaya_general";
    static final long[] ORDER_VIBRATION = {0, 600, 250, 600, 250, 900};

    /** Kinds the orders app shows. 'pick' (runner: go and take it) belongs to the staff app. */
    static final Set<String> ORDER_KINDS = new HashSet<>(Arrays.asList("ready", "onway", "adj", "comp", "mgmt", "move", "del"));
    /** Kinds that ring with the loud order sound. */
    static final Set<String> LOUD_KINDS = new HashSet<>(Arrays.asList("pick", "ready", "onway", "bad"));

    private Alerts() {}

    static Uri sound(Context c) {
        return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + c.getPackageName() + "/" + R.raw.order_alert);
    }

    static void createChannels(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;

        NotificationChannel orders = new NotificationChannel(CH_ORDERS, c.getString(R.string.ch_orders), NotificationManager.IMPORTANCE_HIGH);
        orders.setDescription(c.getString(R.string.ch_orders_desc));
        orders.enableVibration(true);
        orders.setVibrationPattern(ORDER_VIBRATION);
        orders.enableLights(true);
        orders.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        orders.setSound(sound(c), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        nm.createNotificationChannel(orders);

        NotificationChannel general = new NotificationChannel(CH_GENERAL, c.getString(R.string.ch_general), NotificationManager.IMPORTANCE_DEFAULT);
        general.enableVibration(true);
        nm.createNotificationChannel(general);
    }
}
