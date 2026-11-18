package com.amaya.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.print.PrintManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/** The Amaya web app in a full-screen window, with native notifications, location, file picking and printing. */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 11;
    private static final int REQ_LOCATION = 12;
    private static final int REQ_NOTIFY = 13;
    private static final int REQ_FIT = 14;
    private static final String HOST = "abdualdore-dev.github.io";

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private volatile String pushToken = "";

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().setStatusBarColor(Color.parseColor("#1e2a32"));
        Alerts.createChannels(this);
        pushToken = getSharedPreferences("amaya", Context.MODE_PRIVATE).getString("push_token", "");
        startPush();
        askNotifications();

        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " AmayaApp/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(), "AmayaApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (hasLocation()) {
                    cb.invoke(origin, true, true);
                } else {
                    geoOrigin = origin;
                    geoCallback = cb;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(BuildConfig.START_URL);
    }

    private void showOffline() {
        String html = "<html dir='rtl'><body style=\"margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;background:#f1f4f5;color:#1e2a32;text-align:center;padding:24px\">"
                + "<h2 style='margin:0 0 8px'>لا يوجد اتصال بالإنترنت</h2><p style='color:#4f5b63'>تأكد من الواي فاي أو البيانات، ثم أعد المحاولة.</p>"
                + "<button style='margin-top:16px;padding:14px 28px;border:0;border-radius:12px;background:#1e2a32;color:#fff;font-size:17px' onclick=\"location.href='" + BuildConfig.START_URL + "'\">إعادة المحاولة</button></body></html>";
        web.loadDataWithBaseURL(BuildConfig.START_URL, html, "text/html", "utf-8", null);
    }

    private boolean hasLocation() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
        }
    }

    private void startPush() {
        if (!BuildConfig.HAS_FIREBASE) return;
        try {
            if (FirebaseApp.getApps(this).isEmpty()) FirebaseApp.initializeApp(this);
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(t -> {
                if (t == null) return;
                pushToken = t;
                getSharedPreferences("amaya", Context.MODE_PRIVATE).edit().putString("push_token", t).apply();
            });
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code == REQ_LOCATION && geoCallback != null) {
            geoCallback.invoke(geoOrigin, hasLocation(), true);
            geoCallback = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == REQ_FIT) {
            fitRead(true);
            return;
        }
        if (code == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            fileCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
            web.evaluateJavascript("try{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))}catch(e){}", null);
        }
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        // the web app keeps its own screens; the back button leaves the app running in the background
        moveTaskToBack(true);
    }

    private void fitRead(boolean loud) {
        Fit.read(this, loud, json -> runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript("try{window.amayaFitCb&&window.amayaFitCb(" + org.json.JSONObject.quote(json) + ")}catch(e){}", null);
        }));
    }

    /** Functions the web app can call as window.AmayaApp.* */
    private class Bridge {
        @JavascriptInterface
        public String pushToken() {
            return pushToken == null ? "" : pushToken;
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public boolean ordersApp() {
            return BuildConfig.ORDERS_APP;
        }

        @JavascriptInterface
        public void vibrate(long ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(Math.max(50, Math.min(ms, 3000)), VibrationEffect.DEFAULT_AMPLITUDE));
            else v.vibrate(Math.max(50, Math.min(ms, 3000)));
        }

        @JavascriptInterface
        public void notify(String title, String body, boolean loud) {
            PushService.show(MainActivity.this, title, body, loud);
        }

        @JavascriptInterface
        public String fitStatus() {
            try {
                return Fit.status(MainActivity.this);
            } catch (Throwable e) {
                return "no";
            }
        }

        /** Asks for permission the first time; afterwards reads and shows a confirmation. */
        @JavascriptInterface
        public void fitAsk() {
            runOnUiThread(() -> {
                String st = fitStatus();
                if ("ok".equals(st)) {
                    fitRead(true);
                    return;
                }
                if ("nohc".equals(st)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata")));
                    } catch (ActivityNotFoundException e) {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata")));
                    }
                    return;
                }
                Intent i = Fit.permissionIntent(MainActivity.this);
                if (i == null) return;
                try {
                    startActivityForResult(i, REQ_FIT);
                } catch (ActivityNotFoundException e) {
                    fitRead(true);
                }
            });
        }

        @JavascriptInterface
        public void fitRead() {
            MainActivity.this.fitRead(false);
        }

        @JavascriptInterface
        public void print() {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (pm != null) pm.print("Amaya", web.createPrintDocumentAdapter("Amaya"), null);
            });
        }
    }
}
