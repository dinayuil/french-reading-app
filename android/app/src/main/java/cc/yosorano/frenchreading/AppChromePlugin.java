package cc.yosorano.frenchreading;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Applies the in-app light/dark appearance to the Android system bars. The
 * chosen value is also kept in native preferences so the next activity start
 * paints its window background in the same theme before the WebView runs.
 */
@CapacitorPlugin(name = "AppChrome")
public class AppChromePlugin extends Plugin {

    static final String PREFS_NAME = "app_chrome";
    static final String DARK_KEY = "dark";
    static final String SYSTEM_KEY = "system";

    @PluginMethod
    public void apply(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        boolean system = Boolean.TRUE.equals(call.getBoolean("system", false));
        String background = call.getString(
            "background",
            dark ? "#121518" : "#FBF9F4"
        );
        String barBackground = call.getString(
            "barBackground",
            dark ? "#1B1F24" : "#FFFFFF"
        );

        int backgroundColor;
        int barColor;
        try {
            backgroundColor = Color.parseColor(background);
        } catch (IllegalArgumentException error) {
            backgroundColor = Color.parseColor(dark ? "#121518" : "#FBF9F4");
        }
        try {
            barColor = Color.parseColor(barBackground);
        } catch (IllegalArgumentException error) {
            barColor = Color.parseColor(dark ? "#1B1F24" : "#FFFFFF");
        }

        getContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(DARK_KEY, dark)
            .putBoolean(SYSTEM_KEY, system)
            .apply();

        final int windowBackground = backgroundColor;
        final int bars = barColor;
        getActivity().runOnUiThread(() -> {
            applyThemeToWindow(getActivity(), dark, windowBackground, bars);
            JSObject result = new JSObject();
            result.put("dark", dark);
            call.resolve(result);
        });
    }

    /** Shared by the plugin and MainActivity so startup and runtime agree. */
    static void applyThemeToWindow(
        Activity activity,
        boolean dark,
        int backgroundColor,
        int barColor
    ) {
        Window window = activity.getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        // Paint the window for areas behind the transparent system bars.
        window.setBackgroundDrawable(new ColorDrawable(backgroundColor));
        window.getDecorView().setBackgroundColor(backgroundColor);

        // Older Android versions still support solid system bar backgrounds.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            window.setStatusBarColor(barColor);
            window.setNavigationBarColor(barColor);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.setNavigationBarDividerColor(barColor);
            }
        }

        // Android 15/16 applies a translucent contrast scrim to the default
        // three-button navigation bar. Remove it so the selected app
        // background is what shows through, and so the icon appearance below
        // is not overridden by the system light/dark scheme.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }

        // Apply icon appearance last, with a fresh controller. On API 35,
        // updating the navigation-bar color/contrast can re-apply the system
        // light/dark navigation style; doing this before the color update
        // leaves the three-button icons in the system scheme.
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }
}
