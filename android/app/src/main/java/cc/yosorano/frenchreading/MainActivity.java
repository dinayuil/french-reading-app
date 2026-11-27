package cc.yosorano.frenchreading;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppChromePlugin.class);

        boolean systemDark =
            (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        android.content.SharedPreferences preferences =
            getSharedPreferences(AppChromePlugin.PREFS_NAME, Context.MODE_PRIVATE);
        boolean system = preferences.getBoolean(AppChromePlugin.SYSTEM_KEY, true);
        boolean dark = system
            ? systemDark
            : preferences.getBoolean(AppChromePlugin.DARK_KEY, systemDark);

        int background = Color.parseColor(dark ? "#121518" : "#FBF9F4");
        int bars = Color.parseColor(dark ? "#1B1F24" : "#FFFFFF");

        // BridgeActivity.onCreate replaces the activity theme and content view,
        // so this early paint can be overwritten. AppChrome re-applies the
        // background after super.onCreate and on every runtime theme change.
        getWindow().setBackgroundDrawable(new ColorDrawable(background));

        super.onCreate(savedInstanceState);

        // Let Capacitor handle the system bar insets from a full-window layout.
        WindowCompat.enableEdgeToEdge(getWindow());
        AppChromePlugin.applyThemeToWindow(this, dark, background, bars);
    }
}
