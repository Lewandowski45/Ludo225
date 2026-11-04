package ci.ludoclash225;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/* Rappels locaux (sans serveur) : défi du jour à 19 h, nouvelle saison le lundi à 12 h. */
public class Rappels extends BroadcastReceiver {
    static final String PREFS = "ludo", CH = "rappels", DEFI = "ci.ludoclash225.DEFI", SAISON = "ci.ludoclash225.SAISON";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static String today() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().getTime()); }

    static PendingIntent pi(Context c, String action, int code) {
        Intent i = new Intent(c, Rappels.class).setAction(action);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        if (!prefs(c).getBoolean("on", false)) { am.cancel(pi(c, DEFI, 1)); am.cancel(pi(c, SAISON, 2)); return; }
        Calendar d = Calendar.getInstance();
        d.set(Calendar.HOUR_OF_DAY, 19); d.set(Calendar.MINUTE, 0); d.set(Calendar.SECOND, 0);
        if (d.getTimeInMillis() <= System.currentTimeMillis()) d.add(Calendar.DAY_OF_YEAR, 1);
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, d.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi(c, DEFI, 1));
        Calendar m = Calendar.getInstance();
        m.set(Calendar.DAY_OF_WEEK, Calendar.MONDAY); m.set(Calendar.HOUR_OF_DAY, 12); m.set(Calendar.MINUTE, 0); m.set(Calendar.SECOND, 0);
        if (m.getTimeInMillis() <= System.currentTimeMillis()) m.add(Calendar.WEEK_OF_YEAR, 1);
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, m.getTimeInMillis(), AlarmManager.INTERVAL_DAY * 7, pi(c, SAISON, 2));
    }

    static void show(Context c, int id, String title, String text) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CH, "Rappels du clash", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Défi du jour et nouvelle saison");
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_notif).setColor(0xFFF77F00).setContentTitle(title).setContentText(text)
         .setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(tap).setAutoCancel(true);
        try { nm.notify(id, b.build()); } catch (SecurityException e) { }
    }

    @Override
    public void onReceive(Context c, Intent it) {
        String a = it.getAction() == null ? "" : it.getAction();
        SharedPreferences p = prefs(c);
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || "android.intent.action.MY_PACKAGE_REPLACED".equals(a)) { schedule(c); return; }
        if (!p.getBoolean("on", false)) return;
        if (DEFI.equals(a)) {
            if (p.getBoolean("done", false) && today().equals(p.getString("day", ""))) return;
            int st = p.getInt("streak", 0);
            String last = p.getString("last", "");
            Calendar y = Calendar.getInstance(); y.add(Calendar.DAY_OF_YEAR, -1);
            boolean alive = st > 0 && new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(y.getTime()).equals(last);
            if (alive) show(c, 1, "🔥 Ta série de " + st + " jour" + (st > 1 ? "s" : "") + " va s'arrêter !", "Ton défi du jour t'attend sur Ludo Clash 225. Réussis-le avant minuit pour garder ta série.");
            else show(c, 1, "🎯 Ton défi du jour t'attend", "Un nouveau défi est dispo sur Ludo Clash 225, avec un bonus d'XP. Viens clasher !");
        } else if (SAISON.equals(a)) {
            show(c, 2, "👑 Nouvelle saison du clash !", "Le classement de la semaine repart à zéro. Deviens Boss de la semaine et gagne le thème Trône 225.");
        }
    }
}
