package com.securevault.app;

import android.app.Activity;
import android.content.*;
import android.content.res.AssetManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.*;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.*;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.Executor;

public class MainActivity extends Activity {
    private WebView webView;
    private static final int PICK_FILES = 1001;
    private static final int EXPORT_TREE = 1002;
    private String pendingFolder = "";
    private String pendingFilter = "";
    private String pendingExportPath = "";
    private boolean pendingDeleteAfterExport = false;
    private String[] pendingExportPaths = new String[0];
    private final ArrayList<String> pendingImportSources = new ArrayList<>();
    private File vaultRoot;
    private boolean sessionUnlocked = false;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        vaultRoot = new File(getFilesDir(), "vault");
        if (!vaultRoot.exists()) vaultRoot.mkdirs();
        seedSampleFiles();
        cleanExpiredSharedFiles();
        webView = new WebView(this);
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                String u = r.getUrl().toString();
                if (u.startsWith("https://vault.local/file/")) return serveVaultUrl(u);
                return loader.shouldInterceptRequest(r.getUrl());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, String u) {
                if (u.startsWith("https://vault.local/file/")) return serveVaultUrl(u);
                return loader.shouldInterceptRequest(Uri.parse(u));
            }
        });
        webView.addJavascriptInterface(new VaultBridge(), "AndroidVault");
        webView.loadUrl("https://appassets.androidplatform.net/assets/animations.html");
    }

    @Override public void onBackPressed() {
        if (webView == null) return;
        webView.evaluateJavascript("(window.handleAndroidBack?handleAndroidBack():false)", value -> {
            if ("true".equals(value)) return;
            if (webView.canGoBack()) { webView.goBack(); return; }
            if (sessionUnlocked) { webView.loadUrl("https://appassets.androidplatform.net/assets/index.html"); return; }
            webView.evaluateJavascript("window.showGlobalPopup&&showGlobalPopup('↩️','Folder Locker','Use the on-screen navigation to leave this section.');", null);
        });
    }

    private WebResourceResponse serveVaultUrl(String url) {
        try {
            String encoded = url.substring("https://vault.local/file/".length());
            String rel = Uri.decode(encoded);
            File f = safeRelative(rel);
            if (f == null || !f.exists() || !f.isFile()) return null;
            return new WebResourceResponse(getMime(f.getName()), null, new FileInputStream(f));
        } catch (Exception e) { return null; }
    }

    private File safeRelative(String rel) {
        if (rel == null || rel.isEmpty()) return null;
        String clean = rel.replace('\\','/');
        while (clean.startsWith("/")) clean = clean.substring(1);
        if (clean.contains("..")) return null;
        File f = new File(vaultRoot, clean);
        try {
            String root = vaultRoot.getCanonicalPath();
            String path = f.getCanonicalPath();
            if (!path.equals(root) && !path.startsWith(root + File.separator)) return null;
            return f;
        } catch (IOException e) { return null; }
    }
    private File folderDir(String rel) {
        if (rel == null || rel.isEmpty()) return vaultRoot;
        File d = safeRelative(rel);
        if (d != null && !d.exists()) d.mkdirs();
        return d;
    }
    private String relPath(File f) {
        try { return vaultRoot.getCanonicalFile().toURI().relativize(f.getCanonicalFile().toURI()).getPath().replace("\\","/"); }
        catch(Exception e){ return f.getName(); }
    }
    private String cleanName(String n) { return n == null ? "file" : n.replace('/','_').replace('\\','_').replace("..","_").trim(); }
    private String uniqueName(File dir, String name) {
        name = cleanName(name); String base=name, ext=""; int d=name.lastIndexOf('.');
        if(d>0){base=name.substring(0,d);ext=name.substring(d);} String out=name; int i=1;
        while(new File(dir,out).exists()) out=base+"_"+(i++)+ext; return out;
    }
    private String getMime(String n) {
        String x=n.toLowerCase(Locale.ROOT);
        if(x.endsWith(".jpg")||x.endsWith(".jpeg"))return"image/jpeg"; if(x.endsWith(".png"))return"image/png"; if(x.endsWith(".gif"))return"image/gif"; if(x.endsWith(".webp"))return"image/webp"; if(x.endsWith(".bmp"))return"image/bmp";
        if(x.endsWith(".mp4"))return"video/mp4"; if(x.endsWith(".webm"))return"video/webm"; if(x.endsWith(".mkv"))return"video/x-matroska"; if(x.endsWith(".3gp"))return"video/3gpp"; if(x.endsWith(".mov"))return"video/quicktime";
        if(x.endsWith(".mp3"))return"audio/mpeg"; if(x.endsWith(".wav"))return"audio/wav"; if(x.endsWith(".m4a"))return"audio/mp4"; if(x.endsWith(".ogg"))return"audio/ogg"; if(x.endsWith(".aac"))return"audio/aac";
        if(x.endsWith(".pdf"))return"application/pdf"; if(x.endsWith(".txt"))return"text/plain"; if(x.endsWith(".csv"))return"text/csv"; if(x.endsWith(".doc"))return"application/msword"; if(x.endsWith(".docx"))return"application/vnd.openxmlformats-officedocument.wordprocessingml.document"; if(x.endsWith(".xls"))return"application/vnd.ms-excel"; if(x.endsWith(".xlsx"))return"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; if(x.endsWith(".ppt"))return"application/vnd.ms-powerpoint"; if(x.endsWith(".pptx"))return"application/vnd.openxmlformats-officedocument.presentationml.presentation";
        return"application/octet-stream";
    }
    private boolean isCategory(String c){return Arrays.asList("images","videos","music","documents").contains(c);}
    private boolean categoryAccepts(String c,String name,String mime){String m=mime==null?getMime(name):mime;if("images".equals(c))return m.startsWith("image/");if("videos".equals(c))return m.startsWith("video/");if("music".equals(c))return m.startsWith("audio/");if("documents".equals(c))return m.equals("application/pdf")||m.startsWith("text/")||name.matches("(?i).*\\.(doc|docx|xls|xlsx|ppt|pptx|csv|txt|pdf)$");return true;}

    private JSONArray scanTree(File dir, String filter, boolean recursive) {
        JSONArray out=new JSONArray(); File[] fs=dir.listFiles(); if(fs==null)return out;
        Arrays.sort(fs,(a,b)->a.getName().compareToIgnoreCase(b.getName()));
        for(File f:fs){ try{
            String rel=relPath(f);
            if(f.isDirectory()){ if(filter==null || filter.isEmpty()){JSONObject o=new JSONObject();o.put("type","folder");o.put("name",f.getName());o.put("path",rel);o.put("time",f.lastModified());out.put(o); if(recursive){JSONArray children=scanTree(f,null,true);for(int i=0;i<children.length();i++)out.put(children.get(i));}} else if(recursive){JSONArray children=scanTree(f,filter,true);for(int i=0;i<children.length();i++)out.put(children.get(i));}}
            else if(filter==null || filter.isEmpty() || categoryAccepts(filter,f.getName(),getMime(f.getName()))){JSONObject o=new JSONObject();o.put("type","file");o.put("name",f.getName());o.put("path",rel);o.put("size",f.length());o.put("time",f.lastModified());o.put("mime",getMime(f.getName()));o.put("url","https://vault.local/file/"+Uri.encode(rel,"/"));out.put(o);}
        }catch(Exception ignored){}}
        return out;
    }
    private JSONArray listFiles(String category){return scanTree(vaultRoot,category,true);}
    private JSONArray listTree(){return scanTree(vaultRoot,null,true);}

    private class VaultBridge {
        @JavascriptInterface public String listFiles(String category){return listFiles(category).toString();}
        @JavascriptInterface public String listTree(){return listTree().toString();}
        @JavascriptInterface public boolean hasPassword(){return prefs().contains("password_hash");}
        @JavascriptInterface public boolean setPassword(String p){if(p==null||p.length()<4)return false;prefs().edit().putString("password_hash",hash(p)).apply();return true;}
        @JavascriptInterface public boolean verifyPassword(String p){String h=prefs().getString("password_hash","");return !h.isEmpty()&&h.equals(hash(p));}
        @JavascriptInterface public boolean isSessionUnlocked(){return sessionUnlocked;}
        @JavascriptInterface public void unlockSession(){sessionUnlocked=true;}
        @JavascriptInterface public void lockSession(){sessionUnlocked=false;}
        @JavascriptInterface public boolean isFingerprintEnabled(){return prefs().getBoolean("fingerprint_enabled",false);}
        @JavascriptInterface public boolean setFingerprintEnabled(boolean on){prefs().edit().putBoolean("fingerprint_enabled",on).apply();return true;}
        @JavascriptInterface public boolean isDeviceCredentialEnabled(){return prefs().getBoolean("device_credential_enabled",false);}
        @JavascriptInterface public boolean setDeviceCredentialEnabled(boolean on){
            if(on && !canUseDeviceCredential()) return false;
            prefs().edit().putBoolean("device_credential_enabled",on).apply();
            return true;
        }
        @JavascriptInterface public boolean canUseBiometric(){
            if(Build.VERSION.SDK_INT<23)return false;
            android.app.KeyguardManager km=(android.app.KeyguardManager)getSystemService(KEYGUARD_SERVICE);
            return km!=null&&km.isKeyguardSecure();
        }
        @JavascriptInterface public boolean canUseDeviceCredential(){return canUseBiometric();}
        @JavascriptInterface public void pickFiles(String folder){pendingFolder=folder==null?"":folder;pendingFilter="";runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);startActivityForResult(i,PICK_FILES);});}
        @JavascriptInterface public void pickFilesForCategory(String category){pendingFolder="";pendingFilter=category==null?"":category;runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);String[] t=categoryTypes(pendingFilter);if(t!=null&&t.length==1)i.setType(t[0]);else{i.setType("*/*");if(t!=null)i.putExtra(Intent.EXTRA_MIME_TYPES,t);}i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);startActivityForResult(i,PICK_FILES);});}
        @JavascriptInterface public boolean createFolder(String parent,String name){if(name==null||name.trim().isEmpty())return false;File p=folderDir(parent);if(p==null)return false;File d=new File(p,cleanName(name));return !d.exists()&&d.mkdirs();}
        @JavascriptInterface public boolean deleteFile(String path){File f=safeRelative(path);return f!=null&&f.isFile()&&f.delete();}
        @JavascriptInterface public boolean deleteFolder(String path){File f=safeRelative(path);return f!=null&&f.isDirectory()&&deleteRecursively(f);}
        @JavascriptInterface public boolean renameFile(String oldPath,String newName){File a=safeRelative(oldPath);if(a==null||!a.isFile()||newName==null||newName.trim().isEmpty())return false;File b=new File(a.getParentFile(),cleanName(newName));return !b.exists()&&a.renameTo(b);}
        @JavascriptInterface public boolean renameFolder(String oldPath,String newName){File a=safeRelative(oldPath);if(a==null||!a.isDirectory()||newName==null||newName.trim().isEmpty())return false;File b=new File(a.getParentFile(),cleanName(newName));return !b.exists()&&a.renameTo(b);}
        @JavascriptInterface public boolean copyFile(String path,String targetFolder){try{File s=safeRelative(path),d0=folderDir(targetFolder);if(s==null||!s.isFile()||d0==null)return false;File d=new File(d0,uniqueName(d0,s.getName()));copyStream(new FileInputStream(s),new FileOutputStream(d));return true;}catch(Exception e){return false;}}
        @JavascriptInterface public boolean moveFile(String path,String targetFolder){try{File s=safeRelative(path),d0=folderDir(targetFolder);if(s==null||!s.isFile()||d0==null)return false;if(s.getParentFile()!=null && s.getParentFile().equals(d0))return true;File d=new File(d0,uniqueName(d0,s.getName()));copyStream(new FileInputStream(s),new FileOutputStream(d));return s.delete();}catch(Exception e){return false;}}
        @JavascriptInterface public boolean shareFile(String path){try{File f=safeRelative(path);if(f==null||!f.isFile()||!f.exists())return false;File temp=createSharedTempCopy(f);if(temp==null)return false;Uri u=FileProvider.getUriForFile(MainActivity.this,getPackageName()+".fileprovider",temp);Intent i=new Intent(Intent.ACTION_SEND);i.setType(getMime(f.getName()));i.putExtra(Intent.EXTRA_STREAM,u);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(Intent.createChooser(i,"Share temporary copy of "+f.getName()));return true;}catch(Exception e){return false;}}
        @JavascriptInterface public boolean shareFiles(String pathsJson){try{JSONArray a=new JSONArray(pathsJson);ArrayList<Uri> us=new ArrayList<>();String mime="*/*";for(int i=0;i<a.length();i++){File f=safeRelative(a.getString(i));if(f!=null&&f.isFile()&&f.exists()){File temp=createSharedTempCopy(f);if(temp!=null){us.add(FileProvider.getUriForFile(MainActivity.this,getPackageName()+".fileprovider",temp));mime=getMime(f.getName());}}}if(us.isEmpty())return false;Intent in=new Intent(Intent.ACTION_SEND_MULTIPLE);in.setType(mime);in.putParcelableArrayListExtra(Intent.EXTRA_STREAM,us);in.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(Intent.createChooser(in,"Share temporary copies"));return true;}catch(Exception e){return false;}}
        @JavascriptInterface public boolean openFile(String path){try{File f=safeRelative(path);if(f==null||!f.isFile()||!f.exists())return false;File temp=createSharedTempCopy(f);if(temp==null)return false;Uri u=FileProvider.getUriForFile(MainActivity.this,getPackageName()+".fileprovider",temp);Intent i=new Intent(Intent.ACTION_VIEW);i.setDataAndType(u,getMime(f.getName()));i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(Intent.createChooser(i,"Open temporary copy with"));return true;}catch(android.content.ActivityNotFoundException e){return false;}catch(Exception e){return false;}}
        @JavascriptInterface public boolean exportFile(String path){pendingExportPath=path;pendingExportPaths=new String[]{path};pendingDeleteAfterExport=false;startExportPicker();return true;}
        @JavascriptInterface public boolean exportFiles(String pathsJson){try{JSONArray a=new JSONArray(pathsJson);pendingExportPaths=new String[a.length()];for(int i=0;i<a.length();i++)pendingExportPaths[i]=a.getString(i);pendingExportPath="";pendingDeleteAfterExport=false;startExportPicker();return true;}catch(Exception e){return false;}}
        @JavascriptInterface public boolean removeToDownloads(String path){pendingExportPath=path;pendingExportPaths=new String[]{path};pendingDeleteAfterExport=true;startExportPicker();return true;}
        @JavascriptInterface public void authenticateBiometric(){
            if(!isFingerprintEnabled() && !isDeviceCredentialEnabled()){
                notifyMessage("biometricDisabled");
                return;
            }
            runOnUiThread(()->{
                if(Build.VERSION.SDK_INT<28){notifyBiometric(false);return;}
                try{
                    Executor ex=getMainExecutor();
                    android.hardware.biometrics.BiometricPrompt.Builder builder =
                            new android.hardware.biometrics.BiometricPrompt.Builder(MainActivity.this)
                                    .setTitle("Folder Locker")
                                    .setSubtitle("Unlock your private vault")
                                    .setDescription("Use your fingerprint or your phone PIN/pattern/password.");
                    if(Build.VERSION.SDK_INT>=30){
                        builder.setAllowedAuthenticators(
                                android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG |
                                android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL
                        );
                    }else if(Build.VERSION.SDK_INT>=29){
                        builder.setDeviceCredentialAllowed(true);
                    }else{
                        builder.setNegativeButton("Use password",ex,(d,w)->{});
                    }
                    android.hardware.biometrics.BiometricPrompt prompt=builder.build();
                    prompt.authenticate(
                            new android.os.CancellationSignal(),
                            ex,
                            new android.hardware.biometrics.BiometricPrompt.AuthenticationCallback(){
                                @Override public void onAuthenticationSucceeded(android.hardware.biometrics.BiometricPrompt.AuthenticationResult r){
                                    sessionUnlocked=true;notifyBiometric(true);
                                }
                                @Override public void onAuthenticationFailed(){notifyBiometric(false);}
                                @Override public void onAuthenticationError(int e,CharSequence m){notifyBiometric(false);}
                            }
                    );
                }catch(Exception e){
                    notifyMessage("biometricError");
                }
            });
        }
        @JavascriptInterface public void openWhatsApp(){runOnUiThread(()->{try{Intent i=new Intent(Intent.ACTION_VIEW,Uri.parse("https://wa.me/256709387311?text="+Uri.encode("Hello, can you create for me a website. Please")));if(getPackageManager().resolveActivity(i,0)!=null){startActivity(i);webView.evaluateJavascript("window.onWhatsAppResult&&window.onWhatsAppResult(true)",null);}else webView.evaluateJavascript("window.onWhatsAppResult&&window.onWhatsAppResult(false)",null);}catch(Exception e){webView.evaluateJavascript("window.onWhatsAppResult&&window.onWhatsAppResult(false)",null);}});}
    }

    private void seedSampleFiles(){
        android.content.SharedPreferences p=prefs();
        if(p.getBoolean("sample_files_seeded_v1",false))return;
        String[] samples={"image1.jpg","image2.jpg","image3.jpg","sound1.mp3","sound2.mp3","sound3.mp3","video1.mp4","video2.mp4","video3.mp4"};
        for(String name:samples){File out=new File(vaultRoot,name);if(out.exists())continue;try(InputStream in=getAssets().open(name);OutputStream os=new FileOutputStream(out)){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)os.write(b,0,n);}catch(Exception e){File partial=new File(vaultRoot,name);if(partial.exists())partial.delete();}}
        p.edit().putBoolean("sample_files_seeded_v1",true).apply();
    }
    private File sharedTempDir(){File d=new File(getCacheDir(),"shared");if(!d.exists())d.mkdirs();return d;}
    private File createSharedTempCopy(File original)throws IOException{
        File dir=sharedTempDir();File temp=new File(dir,System.currentTimeMillis()+"_"+UUID.randomUUID().toString().substring(0,8)+"_"+original.getName());
        try{copyStream(new FileInputStream(original),new FileOutputStream(temp));if(!temp.isFile()||temp.length()!=original.length()){temp.delete();return null;}new Handler(Looper.getMainLooper()).postDelayed(()->{if(temp.exists())temp.delete();},10*60*1000L);return temp;}catch(IOException e){if(temp.exists())temp.delete();throw e;}
    }
    private void cleanExpiredSharedFiles(){File d=sharedTempDir();File[] fs=d.listFiles();if(fs==null)return;long cutoff=System.currentTimeMillis()-10*60*1000L;for(File f:fs)if(f.isFile()&&f.lastModified()<cutoff)f.delete();}
    private String[] categoryTypes(String c){if("images".equals(c))return new String[]{"image/*"};if("videos".equals(c))return new String[]{"video/*"};if("music".equals(c))return new String[]{"audio/*"};if("documents".equals(c))return new String[]{"application/pdf","text/*","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"};return null;}
    private void startExportPicker(){runOnUiThread(()->{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);startActivityForResult(i,EXPORT_TREE);});}
    private android.content.SharedPreferences prefs(){return getSharedPreferences("folder_locker_security",MODE_PRIVATE);}
    private String hash(String s){try{byte[] b=MessageDigest.getInstance("SHA-256").digest(s.getBytes("UTF-8"));StringBuilder x=new StringBuilder();for(byte q:b)x.append(String.format(Locale.US,"%02x",q));return x.toString();}catch(Exception e){return"";}}
    private void notifyBiometric(boolean ok){webView.post(()->webView.evaluateJavascript("window.onNativeBiometric&&window.onNativeBiometric("+ok+")",null));}
    private void notifyMessage(String code){webView.post(()->webView.evaluateJavascript("window.onNativeSecurityMessage&&window.onNativeSecurityMessage("+JSONObject.quote(code)+")",null));}

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==PICK_FILES){
            if(resultCode!=RESULT_OK||data==null)return;
            ArrayList<Uri> us=new ArrayList<>();
            if(data.getClipData()!=null)for(int i=0;i<data.getClipData().getItemCount();i++)us.add(data.getClipData().getItemAt(i).getUri());
            else if(data.getData()!=null)us.add(data.getData());
            int added=0,removed=0,failedRemove=0;
            String importedFolder=pendingFolder;
            for(Uri u:us){
                boolean ok=copyUri(u,importedFolder,pendingFilter);
                if(ok){
                    added++;
                    // The original is removed only AFTER a complete, verified vault copy.
                    if(tryDeleteSource(u))removed++;else failedRemove++;
                }
            }
            final int a=added,r=removed,f=failedRemove;
            webView.postDelayed(()->webView.evaluateJavascript(
                    "window.onNativeFilesImported&&window.onNativeFilesImported("+
                    JSONObject.quote(importedFolder)+","+a+","+r+","+f+")",null),150);
            return;
        }
        if(requestCode==EXPORT_TREE&&resultCode==RESULT_OK&&data!=null&&data.getData()!=null){Uri tree=data.getData();try{getContentResolver().takePersistableUriPermission(tree,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);}catch(Exception ignored){}int done=0;for(String p:pendingExportPaths)if(exportOneToTree(tree,p,pendingDeleteAfterExport))done++;final int n=done;webView.postDelayed(()->webView.evaluateJavascript("window.onNativeExportDone&&window.onNativeExportDone("+n+","+pendingExportPaths.length+")",null),150);}
    }
    private boolean copyUri(Uri u,String target,String filter){
        File temp=null;
        try{
            try{
                if("content".equalsIgnoreCase(u.getScheme())){
                    getContentResolver().takePersistableUriPermission(u,Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
            }catch(Exception ignored){}
            String name=queryName(u);
            if(name==null||name.trim().isEmpty())name="file_"+System.currentTimeMillis();
            String mime=null;
            try{mime=getContentResolver().getType(u);}catch(Exception ignored){}
            if(filter!=null&&!filter.isEmpty()&&!categoryAccepts(filter,name,mime))return false;
            File dir=folderDir(target);
            if(dir==null||!dir.exists()||!dir.isDirectory())return false;
            File out=new File(dir,uniqueName(dir,name));
            temp=new File(dir,"."+out.getName()+".importing");
            long copied=0;
            try(InputStream in=getContentResolver().openInputStream(u);OutputStream o=new FileOutputStream(temp)){
                if(in==null)return false;
                byte[] b=new byte[65536];int n;
                while((n=in.read(b))!=-1){o.write(b,0,n);copied+=n;}
                o.flush();
            }
            if(copied<=0||!temp.exists()||temp.length()!=copied){if(temp.exists())temp.delete();return false;}
            if(!temp.renameTo(out)){
                try(InputStream in=new FileInputStream(temp);OutputStream o=new FileOutputStream(out)){
                    byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)o.write(b,0,n);o.flush();
                }
                temp.delete();
            }
            return out.exists()&&out.isFile()&&out.length()==copied;
        }catch(Exception e){if(temp!=null&&temp.exists())temp.delete();return false;}
    }
    private String queryName(Uri u){Cursor c=null;try{c=getContentResolver().query(u,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null);if(c!=null&&c.moveToFirst())return c.getString(0);}catch(Exception ignored){}finally{if(c!=null)c.close();}return null;}
    private boolean tryDeleteSource(Uri u){try{if("content".equalsIgnoreCase(u.getScheme()))return DocumentsContract.deleteDocument(getContentResolver(),u);return false;}catch(Exception e){try{return getContentResolver().delete(u,null,null)>0;}catch(Exception ignored){return false;}}}
    private boolean exportOneToTree(Uri tree,String path,boolean delete){try{File src=safeRelative(path);if(src==null||!src.isFile())return false;String name=src.getName();Uri doc=DocumentsContract.createDocument(getContentResolver(),tree,getMime(name),name);if(doc==null)return false;try(InputStream in=new FileInputStream(src);OutputStream out=getContentResolver().openOutputStream(doc)){if(out==null)throw new IOException();byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}if(delete)src.delete();return true;}catch(Exception e){return false;}}
    private boolean deleteRecursively(File f){if(f.isDirectory()){File[] x=f.listFiles();if(x!=null)for(File q:x)if(!deleteRecursively(q))return false;}return f.delete();}
    private void copyStream(InputStream in,OutputStream out)throws IOException{try(InputStream a=in;OutputStream b=out){byte[] buf=new byte[65536];int n;while((n=a.read(buf))!=-1)b.write(buf,0,n);}}
}
