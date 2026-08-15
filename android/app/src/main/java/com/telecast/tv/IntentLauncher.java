package com.telecast.tv;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import androidx.core.content.FileProvider;

import java.io.File;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Fires Android ACTION_VIEW intents so the React app can hand a media URL
 * off to VLC / MX Player / the system chooser. Plugin name: "IntentLauncher".
 *
 * Methods:
 *   openExternal({ url, package?, mime? }) — launch a player with the URL
 *   isInstalled({ package }) → { installed: boolean }
 */
@CapacitorPlugin(name = "IntentLauncher")
public class IntentLauncher extends Plugin {

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url required");
            return;
        }
        String pkg = call.getString("package");
        String mime = call.getString("mime");
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri uri = Uri.parse(url);
            if (mime != null) {
                intent.setDataAndType(uri, mime);
            } else {
                intent.setData(uri);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (pkg != null && !pkg.isEmpty()) {
                // Target a specific app
                intent.setPackage(pkg);
                getContext().startActivity(intent);
            } else {
                // Let Android show the chooser
                Intent chooser = Intent.createChooser(intent, "Open with");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("intent failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isInstalled(PluginCall call) {
        String pkg = call.getString("package");
        if (pkg == null || pkg.isEmpty()) {
            call.reject("package required");
            return;
        }
        boolean installed;
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            installed = true;
        } catch (PackageManager.NameNotFoundException e) {
            installed = false;
        }
        JSObject result = new JSObject();
        result.put("installed", installed);
        call.resolve(result);
    }

    /**
     * Hand a file on local disk to another app. Other apps can't read our
     * private cache directly, so the path is republished as a content:// URI
     * through the FileProvider declared in AndroidManifest.xml, with a
     * temporary read grant attached to the intent.
     *
     * openFile({ path, mime?, package? })
     */
    @PluginMethod
    public void openFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("path required");
            return;
        }
        String pkg = call.getString("package");
        String mime = call.getString("mime", "video/*");
        try {
            File file = new File(path);
            if (!file.exists()) {
                call.reject("file not found: " + path);
                return;
            }
            Uri uri = FileProvider.getUriForFile(
                getContext(), getContext().getPackageName() + ".fileprovider", file);

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mime);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

            if (pkg != null && !pkg.isEmpty()) {
                intent.setPackage(pkg);
                getContext().startActivity(intent);
            } else {
                Intent chooser = Intent.createChooser(intent, "Open with");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().startActivity(chooser);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("open file failed: " + e.getMessage());
        }
    }

    /**
     * Quit the app. MainActivity swallows the BACK key, so this is the only
     * way out — wired to the Exit row in Settings.
     */
    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        getActivity().finishAndRemoveTask();
    }
}
