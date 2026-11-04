package ci.ludoclash225;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.content.ClipData;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import java.io.File;
import java.io.FileOutputStream;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/* Ludo Clash 225 : l'app ouvre le jeu en plein écran (ludo225.vercel.app). */
public class MainActivity extends Activity {
    private static final String HOME = "https://ludo225.vercel.app/";
    private static final int PICK = 225;
    private WebView web;
    private ValueCallback<Uri[]> pending;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        /* Les touches volume règlent le son du jeu (média), pas la sonnerie */
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#04251A"));
        setContentView(web);
        immersive();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setUserAgentString(s.getUserAgentString() + " LudoClash225App/1.5");
        web.addJavascriptInterface(new Bridge(), "LudoApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                if (host.equals("ludo225.vercel.app")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pending != null) pending.onReceiveValue(null);
                pending = cb;
                try {
                    Intent i = p.createIntent();
                    if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(i, PICK);
                } catch (Exception e) { pending = null; return false; }
                return true;
            }
        });
        String start = inviteUrl(getIntent());
        Rappels.schedule(this);
        if (saved != null && start == null) web.restoreState(saved); else web.loadUrl(start != null ? start : HOME);
    }

    /* Pont appelé par le jeu : partage l'image du résultat (WhatsApp, statut…) */
    class Bridge {
        @JavascriptInterface public boolean canShare() { return true; }
        /* état du défi du jour envoyé par le jeu (pour savoir s'il faut rappeler) */
        @JavascriptInterface public void setDefi(String day, boolean done, int streak, String last) {
            Rappels.prefs(MainActivity.this).edit().putString("day", day).putBoolean("done", done).putInt("streak", streak).putString("last", last).apply();
        }
        @JavascriptInterface public boolean notifOn() { return Rappels.prefs(MainActivity.this).getBoolean("on", false); }
        @JavascriptInterface public boolean notifAsked() { return Rappels.prefs(MainActivity.this).getBoolean("asked", false); }
        @JavascriptInterface public void setNotif(boolean on) {
            Rappels.prefs(MainActivity.this).edit().putBoolean("on", on).putBoolean("asked", true).apply();
            if (on && Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED)
                runOnUiThread(() -> requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 77));
            Rappels.schedule(MainActivity.this);
        }
        @JavascriptInterface public void shareImage(String dataUrl, String text) {
            try {
                String b64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
                byte[] png = Base64.decode(b64, Base64.DEFAULT);
                if (png.length > 8 * 1024 * 1024) return;
                File f = ShareProvider.fileFor(MainActivity.this);
                f.getParentFile().mkdirs();
                try (FileOutputStream o = new FileOutputStream(f)) { o.write(png); }
                final Uri uri = Uri.parse("content://" + ShareProvider.AUTH + "/ludo-clash-225.png");
                final Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                if (text != null) send.putExtra(Intent.EXTRA_TEXT, text);
                send.setClipData(ClipData.newRawUri("", uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> { try { startActivity(Intent.createChooser(send, "Partager le clash")); } catch (Exception e) { } });
            } catch (Exception e) { }
        }
    }

    /* Lien d'invitation reçu (WhatsApp…) : renvoie l'URL du salon ou null */
    private String inviteUrl(Intent it) {
        if (it == null || it.getData() == null) return null;
        Uri u = it.getData();
        if (!"ludo225.vercel.app".equals(u.getHost())) return null;
        String q = u.getEncodedQuery();
        if (q == null || !(q.contains("salon=") || q.contains("defi=") || q.contains("ref="))) return null;
        return HOME + "?" + q;
    }

    @Override
    protected void onNewIntent(Intent it) {
        super.onNewIntent(it);
        String u = inviteUrl(it);
        if (u == null || web == null) return;
        final String q = u.substring(u.indexOf('?')).replaceAll("[^A-Za-z0-9?=&_%.-]", "");
        /* l'appli est déjà ouverte : on traite le lien (salon, défi, parrain) sans recharger le jeu */
        web.evaluateJavascript("window.LudoOpen?LudoOpen('" + q + "'):location.href='" + HOME + q + "'", null);
    }

    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override public void onWindowFocusChanged(boolean f) { super.onWindowFocusChanged(f); if (f) immersive(); }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK && pending != null) {
            Uri[] r = WebChromeClient.FileChooserParams.parseResult(res, data);
            if (r == null && data != null && data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                r = new Uri[n];
                for (int k = 0; k < n; k++) r[k] = data.getClipData().getItemAt(k).getUri();
            }
            pending.onReceiveValue(r);
            pending = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    public void onBackPressed() {
        /* Retour : ferme d'abord le menu du jeu via l'historique, sinon met l'app en arrière-plan */
        if (web != null && web.canGoBack()) web.goBack(); else moveTaskToBack(true);
    }

    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); if (web != null) web.saveState(out); }
    @Override protected void onPause() { super.onPause(); if (web != null) web.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); immersive(); }
}
