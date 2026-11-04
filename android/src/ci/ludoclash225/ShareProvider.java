package ci.ludoclash225;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/* Donne à WhatsApp (ou autre) l'accès en lecture à l'image du résultat, sans bibliothèque externe. */
public class ShareProvider extends ContentProvider {
    public static final String AUTH = "ci.ludoclash225.share";
    static File fileFor(android.content.Context c) { return new File(new File(c.getCacheDir(), "share"), "ludo-clash-225.png"); }

    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "image/png"; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("lecture seule");
        return ParcelFileDescriptor.open(fileFor(getContext()), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
        File f = fileFor(getContext());
        MatrixCursor m = new MatrixCursor(new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        m.addRow(new Object[]{f.getName(), f.length()});
        return m;
    }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
