package com.amaya.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Receives order and staff notifications from the push service and shows them, also when the app is closed. */
public class PushService extends FirebaseMessagingService {

    @Override
    public void onNewToken(String token) {
        getSharedPreferences("amaya", Context.MODE_PRIVATE).edit().putString("push_token", token).apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage msg) {
        Map<String, String> d = msg.getData();
        if (d == null || d.isEmpty()) return;
        String kind = d.containsKey("kind") ? d.get("kind") : "info";
        boolean orderKind = Alerts.ORDER_KINDS.contains(kind);
        // each app shows its own kinds, so a phone with both apps does not ring twice
        if (BuildConfig.ORDERS_APP != orderKind) return;

        String title = pick(d, "title_ar", "title_en");
        String body = pick(d, "body_ar", "body_en");
        if (title.isEmpty()) title = getString(R.string.app_name);
        show(this, title, body, Alerts.LOUD_KINDS.contains(kind));
    }

    private static String pick(Map<String, String> d, String a, String b) {
        String v = d.get(a);
        if (v == null || v.isEmpty()) v = d.get(b);
        return v == null ? "" : v;
    }

    static void show(Context c, String title, String body, boolean loud) {
        Alerts.createChannels(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, (int) (System.currentTimeMillis() & 0xffff), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Notification.Builder(c, loud ? Alerts.CH_ORDERS : Alerts.CH_GENERAL);
        } else {
            b = new Notification.Builder(c);
            b.setPriority(loud ? Notification.PRIORITY_MAX : Notification.PRIORITY_DEFAULT);
            if (loud) {
                b.setSound(Alerts.sound(c));
                b.setVibrate(Alerts.ORDER_VIBRATION);
            }
        }
        b.setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pi)
                .setCategory(loud ? Notification.CATEGORY_ALARM : Notification.CATEGORY_MESSAGE)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setShowWhen(true);
        nm.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), b.build());
    }
}
