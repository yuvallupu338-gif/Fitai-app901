package com.fitai.app;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

/**
 * The whole Android app.
 *
 * FitAI is a static site that keeps everything in localStorage and talks to
 * nobody, so the shell's only job is to put a WebView on the screen and point
 * it at the files in assets/.
 *
 * The one thing that is not obvious is WHY it goes through WebViewAssetLoader
 * rather than loading file:///android_asset/index.html directly, which is the
 * usual recipe. The app carries its own Content-Security-Policy — the one the
 * hardening pass tightened — and it says `script-src 'self'`. Under a file://
 * origin 'self' matches nothing, so every one of the fifty scripts would be
 * refused and the app would come up as a blank page. The asset loader serves
 * the same files over https://appassets.androidplatform.net/, a real origin,
 * where 'self' resolves exactly as it does on the web.
 *
 * That origin is also what localStorage is keyed on, so it has to stay stable
 * across versions or every user's profile disappears on update. It is a
 * constant here for that reason, not a preference.
 */
public class MainActivity extends AppCompatActivity {

    /** Changing this domain orphans every existing user's stored profile. */
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_URL = ORIGIN + "/assets/index.html";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage — the app IS its localStorage
        s.setDatabaseEnabled(true);
        // Nothing here loads from the network, and the CSP would refuse it
        // anyway; this stops the WebView from trying on the app's behalf.
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        // The app is designed at a phone width and sets its own viewport.
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        // A wrapper that lets the WebView re-flow text on its own fights the
        // app's own type scale, which is already age-aware.
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            /**
             * Anything that is not our own origin is a real link — the YouTube
             * technique searches, in practice. Those belong in the browser, not
             * inside an app that has no address bar and no way back out.
             */
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith(ORIGIN)) return false;
                try {
                    startActivity(new android.content.Intent(
                            android.content.Intent.ACTION_VIEW, request.getUrl()));
                } catch (Exception ignored) { }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    /**
     * Back goes back through the app's own history before it leaves. Without
     * this, one tap from a sheet closes the whole application.
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    /**
     * The app saves on a 180 ms debounce and flushes on `pagehide`. Pausing the
     * WebView when Android backgrounds the activity is what makes that fire, so
     * a profile edited and then swiped away is still there next time.
     */
    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
