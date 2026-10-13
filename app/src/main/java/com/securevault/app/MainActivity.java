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
        // Use literal filesystem names, not URI-escaped names. URI.relativize() turns
        // spaces into %20, which made nested folders impossible to reopen on Android.
        try {
            String root = vaultRoot.getCanonicalPath();
            String path = f.getCanonicalPath();
            if (path.equals(root)) return "";
            if (path.startsWith(root + File.separator))
                return path.substring(root.length() + 1).replace(File.separatorChar, '/');
            return f.getName();
        } catch (Exception e) { return f.getName(); }
    }
    private String cleanName(String n) { return n == null ? "file" : n.replace('/','_').replace('\\','_').replace("..","_").trim(); }
    private String uniqueName(File dir, String name) {
        name = cleanName(name); String base=name, ext=""; int d=name.lastIndexOf('.');
        if(d>0){base=name.substring(0,d);ext=name.substring(d);} String out=name; int i=1;
        while(new File(dir,out).exists()) out=base+"_"+(i++)+ext; return out;
    }
    private String getMime(String n) {
        String x=n.toLowerCase(Locale.ROOT);
        if(x.endsWith(".jpg")||x.endsWith(".jpeg"))return"image/jpeg"; if(x.endsWith(".png"))return"image/png"; if(x.endsWith(".gif"))return"image/gif"; if(x.endsWith(".webp"))return"image/webp"; if(x.endsWith(".bmp"))return"image/bmp"; if(x.endsWith(".heic")||x.endsWith(".heif"))return"image/heic"; if(x.endsWith(".avif"))return"image/avif"; if(x.endsWith(".tif")||x.endsWith(".tiff"))return"image/tiff";
        if(x.endsWith(".mp4")||x.endsWith(".m4v"))return"video/mp4"; if(x.endsWith(".webm"))return"video/webm"; if(x.endsWith(".mkv"))return"video/x-matroska"; if(x.endsWith(".3gp"))return"video/3gpp"; if(x.endsWith(".mov"))return"video/quicktime"; if(x.endsWith(".avi"))return"video/x-msvideo"; if(x.endsWith(".mpeg")||x.endsWith(".mpg"))return"video/mpeg";
        if(x.endsWith(".mp3"))return"audio/mpeg"; if(x.endsWith(".wav"))return"audio/wav"; if(x.endsWith(".m4a"))return"audio/mp4"; if(x.endsWith(".ogg"))return"audio/ogg"; if(x.endsWith(".aac"))return"audio/aac"; if(x.endsWith(".flac"))return"audio/flac"; if(x.endsWith(".opus"))return"audio/opus"; if(x.endsWith(".mid")||x.endsWith(".midi"))return"audio/midi"; if(x.endsWith(".wma"))return"audio/x-ms-wma";
        if(x.endsWith(".html")||x.endsWith(".htm"))return"text/html"; if(x.endsWith(".css"))return"text/css"; if(x.endsWith(".js")||x.endsWith(".mjs")||x.endsWith(".cjs"))return"text/javascript"; if(x.endsWith(".java"))return"text/x-java-source"; if(x.endsWith(".json"))return"application/json"; if(x.endsWith(".xml"))return"application/xml"; if(x.endsWith(".md")||x.endsWith(".markdown"))return"text/markdown"; if(x.endsWith(".py"))return"text/x-python"; if(x.endsWith(".c")||x.endsWith(".h"))return"text/x-c"; if(x.endsWith(".cpp")||x.endsWith(".hpp")||x.endsWith(".cc"))return"text/x-c++src"; if(x.endsWith(".sh")||x.endsWith(".bash"))return"text/x-shellscript"; if(x.endsWith(".sql"))return"text/x-sql"; if(x.endsWith(".kt")||x.endsWith(".kts"))return"text/x-kotlin"; if(x.endsWith(".ts")||x.endsWith(".tsx"))return"text/typescript"; if(x.endsWith(".jsx"))return"text/jsx"; if(x.endsWith(".gradle")||x.endsWith(".properties")||x.endsWith(".yaml")||x.endsWith(".yml")||x.endsWith(".log")||x.endsWith(".ini")||x.endsWith(".cfg"))return"text/plain";
        if(x.endsWith(".pdf"))return"application/pdf"; if(x.endsWith(".txt"))return"text/plain"; if(x.endsWith(".csv"))return"text/csv"; if(x.endsWith(".doc"))return"application/msword"; if(x.endsWith(".docx"))return"application/vnd.openxmlformats-officedocument.wordprocessingml.document"; if(x.endsWith(".xls"))return"application/vnd.ms-excel"; if(x.endsWith(".xlsx"))return"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; if(x.endsWith(".ppt"))return"application/vnd.ms-powerpoint"; if(x.endsWith(".pptx"))return"application/vnd.openxmlformats-officedocument.presentationml.presentation";
        return"application/octet-stream";
    }
    private boolean isEditableTextFile(String name){String x=name==null?"":name.toLowerCase(Locale.ROOT);return x.matches(".*\\.(html?|css|m?js|cjs|java|json|xml|md|markdown|py|c|h|cpp|hpp|cc|sh|bash|sql|kt|kts|ts|tsx|jsx|gradle|properties|ya?ml|log|ini|cfg|txt|csv)$");}
    private boolean isCategory(String c){return Arrays.asList("images","videos","music","documents").contains(c);}
    private boolean categoryAccepts(String c,String name,String mime){
        String m=(mime==null||mime.trim().isEmpty()||"application/octet-stream".equalsIgnoreCase(mime))?getMime(name):mime.toLowerCase(Locale.ROOT);
        String n=name==null?"":name.toLowerCase(Locale.ROOT);
        if("images".equals(c))return m.startsWith("image/")||n.matches(".*\\.(jpg|jpeg|png|gif|webp|bmp|heic|heif|avif|tif|tiff)$");
        if("videos".equals(c))return m.startsWith("video/")||n.matches(".*\\.(mp4|mov|mkv|webm|3gp|avi|mpeg|mpg|m4v)$");
        if("music".equals(c))return m.startsWith("audio/")||n.matches(".*\\.(mp3|wav|m4a|ogg|aac|flac|mid|midi|opus|wma)$");
        if("documents".equals(c))return m.equals("application/pdf")||m.startsWith("text/")||m.contains("wordprocessingml")||m.contains("spreadsheetml")||m.contains("presentationml")||m.contains("msword")||m.contains("ms-excel")||m.contains("ms-powerpoint")||n.matches(".*\\.(doc|docx|xls|xlsx|ppt|pptx|csv|txt|pdf|rtf|odt|ods|odp)$");
        return true;
    }

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
        @JavascriptInterface public String listFiles(String category){return MainActivity.this.listFiles(category).toString();}
        @JavascriptInterface public String listTree(){return MainActivity.this.listTree().toString();}
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
        @JavascriptInterface public String readTextFile(String path){try{File f=safeRelative(path);if(f==null||!f.isFile()||f.length()>2*1024*1024||!isEditableTextFile(f.getName()))return null;byte[] b=new byte[(int)f.length()];try(FileInputStream in=new FileInputStream(f)){int off=0,n;while(off<b.length&&(n=in.read(b,off,b.length-off))>0)off+=n;if(off!=b.length)return null;}return new String(b,"UTF-8");}catch(Exception e){return null;}}
        @JavascriptInterface public boolean writeTextFile(String path,String content){File temp=null,backup=null;try{File f=safeRelative(path);if(f==null||!f.isFile()||!isEditableTextFile(f.getName())||content==null||content.getBytes("UTF-8").length>2*1024*1024)return false;temp=new File(f.getParentFile(),"."+f.getName()+".edit-"+UUID.randomUUID().toString().substring(0,8));backup=new File(f.getParentFile(),"."+f.getName()+".backup-"+UUID.randomUUID().toString().substring(0,8));try(FileOutputStream out=new FileOutputStream(temp)){out.write(content.getBytes("UTF-8"));out.flush();out.getFD().sync();}if(!temp.isFile())return false;if(!f.renameTo(backup)){temp.delete();return false;}if(!temp.renameTo(f)){backup.renameTo(f);temp.delete();return false;}backup.delete();return true;}catch(Exception e){if(backup!=null&&backup.exists()){File original=safeRelative(path);if(original!=null&&!original.exists())backup.renameTo(original);}if(temp!=null)temp.delete();return false;}}
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
        @JavascriptInterface public void openWhatsApp(){
            runOnUiThread(()->{
                Uri uri=Uri.parse("https://wa.me/256709387311?text="+Uri.encode("Hello Ahmed. can you create for me a website. Please"));
                boolean launched=false;
                String[] packages={"com.whatsapp","com.whatsapp.w4b"};
                for(String packageName:packages){
                    try{
                        Intent appIntent=new Intent(Intent.ACTION_VIEW,uri);
                        appIntent.setPackage(packageName);
                        startActivity(appIntent);
                        launched=true;
                        break;
                    }catch(android.content.ActivityNotFoundException ignored){}
                    catch(Exception ignored){}
                }
                if(!launched){
                    try{
                        Intent fallback=new Intent(Intent.ACTION_VIEW,uri);
                        startActivity(fallback);
                        launched=true;
                    }catch(Exception ignored){}
                }
                final boolean ok=launched;
                webView.post(()->webView.evaluateJavascript("window.onWhatsAppResult&&window.onWhatsAppResult("+ok+")",null));
            });
        }
    }

    private void seedSampleFiles(){
        // Do not use a one-time preference as the only guard: an earlier APK may have
        // set it before the sample assets were packaged. Ensure every missing sample
        // exists on every launch, without overwriting user files already in the vault.
        String[] samples={"image1.jpg","image2.jpg","image3.jpg","sound1.mp3","sound2.mp3","sound3.mp3","video1.mp4","video2.mp4","video3.mp4"};
        for(String name:samples){
            File out=new File(vaultRoot,name);
            if(out.isFile() && out.length()>0) continue;
            File temp=new File(vaultRoot,"."+name+".seed");
            try(InputStream in=getAssets().open(name);OutputStream os=new FileOutputStream(temp)){
                byte[] b=new byte[65536];int n;
                while((n=in.read(b))!=-1)os.write(b,0,n);
                os.flush();
                if(temp.length()>0){if(out.exists())out.delete();if(!temp.renameTo(out)){try(InputStream ti=new FileInputStream(temp);OutputStream to=new FileOutputStream(out)){byte[] b2=new byte[65536];int m;while((m=ti.read(b2))!=-1)to.write(b2,0,m);}temp.delete();}}
            }catch(Exception e){if(temp.exists())temp.delete();}
        }
        // Names contain spaces intentionally: these folders also exercise literal
        // path handling and nested navigation.
        new File(vaultRoot,"Offline Test Samples/Nested Folder").mkdirs();
        new File(vaultRoot,"Personal").mkdirs();
        new File(vaultRoot,"Work").mkdirs();
        prefs().edit().putBoolean("sample_files_seeded_v2",true).apply();
    }
    private File sharedTempDir(){File d=new File(getCacheDir(),"shared");if(!d.exists())d.mkdirs();return d;}
    private File createSharedTempCopy(File original)throws IOException{
        File dir=sharedTempDir();File temp=new File(dir,System.currentTimeMillis()+"_"+UUID.randomUUID().toString().substring(0,8)+"_"+original.getName());
        try{copyStream(new FileInputStream(original),new FileOutputStream(temp));if(!temp.isFile()||temp.length()!=original.length()){temp.delete();return null;}new Handler(Looper.getMainLooper()).postDelayed(()->{if(temp.exists())temp.delete();},10*60*1000L);return temp;}catch(IOException e){if(temp.exists())temp.delete();throw e;}
    }
    private void cleanExpiredSharedFiles(){File d=sharedTempDir();File[] fs=d.listFiles();if(fs==null)return;long cutoff=System.currentTimeMillis()-10*60*1000L;for(File f:fs)if(f.isFile()&&f.lastModified()<cutoff)f.delete();}
    private String[] categoryTypes(String c){if("images".equals(c))return new String[]{"image/*"};if("videos".equals(c))return new String[]{"video/*"};if("music".equals(c))return new String[]{"audio/*"};if("documents".equals(c))return new String[]{"application/pdf","text/*","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation","application/rtf","application/vnd.oasis.opendocument.text","application/vnd.oasis.opendocument.spreadsheet","application/vnd.oasis.opendocument.presentation","text/csv"};return null;}
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
            int added=0,removed=0,originalsRemain=0,failed=0;
            String importedFolder=pendingFolder;
            String importedFilter=pendingFilter;
            for(Uri u:us){
                // Verify the vault copy before attempting to remove the original.
                if(copyUri(u,importedFolder,importedFilter)){
                    added++;
                    if(tryDeleteSource(u)) removed++;
                    else originalsRemain++;
                }else{
                    failed++;
                }
            }
            pendingFolder=""; pendingFilter="";
            final int a=added,r=removed,p=originalsRemain,f=failed;
            if(a>0){
                String message=r+" original file(s) removed from phone storage.";
                if(p>0) message+=" "+p+" original file(s) could not be removed; check your file manager and remove them manually if you want them kept only in the vault.";
                android.widget.Toast.makeText(MainActivity.this,message,android.widget.Toast.LENGTH_LONG).show();
            }
            webView.postDelayed(()->webView.evaluateJavascript(
                    "window.onNativeFilesImported&&window.onNativeFilesImported("+
                    JSONObject.quote(importedFolder)+", "+a+", "+r+", "+f+")",null),150);
            return;
        }
        if(requestCode==EXPORT_TREE){if(resultCode!=RESULT_OK||data==null||data.getData()==null){final int total=pendingExportPaths.length;webView.postDelayed(()->webView.evaluateJavascript("window.onNativeExportDone&&window.onNativeExportDone(0,"+total+")",null),100);return;}Uri tree=data.getData();try{getContentResolver().takePersistableUriPermission(tree,Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);}catch(Exception ignored){}int done=0;for(String p:pendingExportPaths)if(exportOneToTree(tree,p,pendingDeleteAfterExport))done++;final int n=done,total=pendingExportPaths.length;webView.postDelayed(()->webView.evaluateJavascript("window.onNativeExportDone&&window.onNativeExportDone("+n+","+total+")",null),150);}
    }
    private boolean copyUri(Uri u,String target,String filter){
        File temp=null;
        try{
            try{
                if("content".equalsIgnoreCase(u.getScheme()))
                    getContentResolver().takePersistableUriPermission(u,Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }catch(Exception ignored){}
            String name=queryName(u);
            if(name==null||name.trim().isEmpty())name="file_"+System.currentTimeMillis();
            String mime=null;
            try{mime=getContentResolver().getType(u);}catch(Exception ignored){}
            if(filter!=null&&!filter.isEmpty()&&!categoryAccepts(filter,name,mime))return false;
            File dir=folderDir(target);
            if(dir==null||!dir.exists()||!dir.isDirectory())return false;
            File out=new File(dir,uniqueName(dir,name));
            InputStream source=getContentResolver().openInputStream(u);
            if(source==null)return false;
            temp=new File(dir,"."+out.getName()+"."+UUID.randomUUID().toString().substring(0,8)+".importing");
            long copied=0;
            try(InputStream in=source;OutputStream o=new FileOutputStream(temp)){
                byte[] b=new byte[65536];int n;
                while((n=in.read(b))!=-1){o.write(b,0,n);copied+=n;}
                o.flush();
            }
            if(!temp.isFile()||temp.length()!=copied){temp.delete();return false;}
            if(!temp.renameTo(out)){
                try(InputStream in=new FileInputStream(temp);OutputStream o=new FileOutputStream(out)){
                    byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)o.write(b,0,n);o.flush();
                }
                if(!out.isFile()||out.length()!=copied){out.delete();temp.delete();return false;}
                temp.delete();
            }
            return out.exists()&&out.isFile()&&out.length()==copied;
        }catch(Exception e){if(temp!=null&&temp.exists())temp.delete();return false;}
    }
    private String queryName(Uri u){Cursor c=null;try{c=getContentResolver().query(u,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null);if(c!=null&&c.moveToFirst())return c.getString(0);}catch(Exception ignored){}finally{if(c!=null)c.close();}return null;}
    private boolean tryDeleteSource(Uri u){try{if("content".equalsIgnoreCase(u.getScheme()))return DocumentsContract.deleteDocument(getContentResolver(),u);return false;}catch(Exception e){try{return getContentResolver().delete(u,null,null)>0;}catch(Exception ignored){return false;}}}
    private boolean exportOneToTree(Uri tree,String path,boolean delete){Uri doc=null;try{File src=safeRelative(path);if(src==null||!src.isFile())return false;String name=src.getName();Uri parent=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree));doc=DocumentsContract.createDocument(getContentResolver(),parent,getMime(name),name);if(doc==null)return false;try(InputStream in=new FileInputStream(src);OutputStream out=getContentResolver().openOutputStream(doc,"w")){if(out==null)throw new IOException("Cannot open export destination");byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);out.flush();}long copied=0;try(InputStream check=getContentResolver().openInputStream(doc)){if(check==null)throw new IOException("Cannot verify export");byte[] b=new byte[65536];int n;while((n=check.read(b))!=-1)copied+=n;}if(copied!=src.length()){try{DocumentsContract.deleteDocument(getContentResolver(),doc);}catch(Exception ignored){}return false;}if(delete&&!src.delete())return false;return true;}catch(Exception e){if(doc!=null)try{DocumentsContract.deleteDocument(getContentResolver(),doc);}catch(Exception ignored){}return false;}}
    private boolean deleteRecursively(File f){if(f.isDirectory()){File[] x=f.listFiles();if(x!=null)for(File q:x)if(!deleteRecursively(q))return false;}return f.delete();}
    private void copyStream(InputStream in,OutputStream out)throws IOException{try(InputStream a=in;OutputStream b=out){byte[] buf=new byte[65536];int n;while((n=a.read(buf))!=-1)b.write(buf,0,n);}}
}
