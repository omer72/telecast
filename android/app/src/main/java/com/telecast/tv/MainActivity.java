package com.telecast.tv;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom plugins before super.onCreate() so the bridge picks
        // them up while initializing.
        registerPlugin(IntentLauncher.class);
        super.onCreate(savedInstanceState);

        // Capacitor's WebView defaults to requiring a user gesture before
        // playing media — which often manifests as silent video on autoplay.
        // We always launch playback in response to an explicit user click, so
        // disabling the restriction is safe and lets the audio track play.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        }

        // The TV remote's BACK key never reaches the WebView as a JS key event,
        // and Capacitor has no back handling of its own without @capacitor/app —
        // so the activity would just finish() and the app would vanish mid-use.
        // Swallow it here and forward it to the web layer as an Escape keydown,
        // which is what useFocusGrid already listens for. At the root screen
        // nothing handles it and we simply stay put; the only way out is the
        // Exit row in Settings.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge != null) {
                    bridge.eval("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))", null);
                }
            }
        });
    }
}
