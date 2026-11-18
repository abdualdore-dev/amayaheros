package com.amaya.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

/** Shown by Health Connect when the person asks why the app reads their activity. */
public class PrivacyActivity extends Activity {
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        TextView t = new TextView(this);
        t.setText("يقرأ تطبيق أمايا عدد خطواتك والطوابق والمسافة لهذا اليوم والأيام الستة السابقة فقط، ليعرضها لك في قسم الرياضة. يراها المدير العام أيضاً. لا يقرأ أي بيانات صحية أخرى، ويمكنك إلغاء الصلاحية في أي وقت من Health Connect.");
        t.setTextSize(17);
        t.setLineSpacing(0, 1.4f);
        t.setTextColor(Color.parseColor("#1e2a32"));
        t.setGravity(Gravity.CENTER);
        t.setPadding(56, 56, 56, 56);
        setContentView(t);
    }
}
