package io.github.upinking.deepseekbot;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import java.io.BufferedInputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

/** A small Android host for the private workspace; all Bot work stays on the server. */
public final class MainActivity extends Activity {
    private static final int PICK_FILES = 1101, SAVE_FILE = 1102;
    private static final long MAX_DOWNLOAD_BYTES = 30L * 1024 * 1024;
    private static final int BG = Color.rgb(247, 248, 245), INK = Color.rgb(43, 53, 48);
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private final Set<WebView> popups = new HashSet<>();
    private SharedPreferences preferences;
    private String server, lastPageUrl;
    private WebView web;
    private LinearLayout root;
    private FrameLayout content;
    private View errorView;
    private ProgressBar loading;
    private TextView title;
    private ValueCallback<Uri[]> fileCallback;
    private DownloadRequest pendingDownload;
    private boolean downloadInProgress, rendererFailed;
    private OnBackInvokedCallback backCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        preferences = getSharedPreferences("workspace", MODE_PRIVATE);
        String stored = preferences.getString("server", BuildConfig.DEFAULT_SERVER_URL);
        try { server = UrlPolicy.normalizeServer(stored); }
        catch (IllegalArgumentException ignored) { server = ""; }
        if (state != null && state.getBundle("pending_download") != null) {
            Bundle pending = state.getBundle("pending_download");
            String base = pending.getString("base", ""), url = pending.getString("url", "");
            if (base.equals(server) && UrlPolicy.isInScope(base, url))
                pendingDownload = new DownloadRequest(base, url, pending.getString("agent"));
        }
        buildLayout();
        configureInsets();
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        if (server.isEmpty()) showSetup();
        else {
            boolean restored = false;
            if (state != null && state.getBundle("web") != null) {
                android.webkit.WebBackForwardList history = web.restoreState(state.getBundle("web"));
                restored = history != null && history.getCurrentItem() != null
                        && UrlPolicy.isInScope(server, history.getCurrentItem().getUrl());
            }
            if (!restored) web.loadUrl(server);
        }
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size);
        view.setTextColor(INK); return view;
    }
    private Button button(String label, View.OnClickListener listener) {
        Button button = new Button(this); button.setText(label); button.setTextSize(13);
        button.setAllCaps(false); button.setMinWidth(0); button.setMinimumWidth(0);
        button.setPadding(dp(8), 0, dp(8), 0); button.setOnClickListener(listener); return button;
    }

    private void buildLayout() {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(BG);
        LinearLayout toolbar = new LinearLayout(this); toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(4), 0, dp(4), 0);
        Button back = button("‹", v -> handleBack()); back.setTextSize(28); back.setContentDescription("返回");
        toolbar.addView(back, new LinearLayout.LayoutParams(dp(44), dp(48)));
        title = text("DeepSeek Bot", 17); title.setSingleLine(true);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1)); title.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(button("刷新", v -> reloadWorkspace()), new LinearLayout.LayoutParams(dp(56), dp(48)));
        toolbar.addView(button("设置", v -> showServerDialog()), new LinearLayout.LayoutParams(dp(56), dp(48)));
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, dp(48)));
        loading = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        loading.setMax(100); loading.setVisibility(View.INVISIBLE);
        root.addView(loading, new LinearLayout.LayoutParams(-1, dp(2)));
        content = new FrameLayout(this); root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        web = new WebView(this); web.setBackgroundColor(BG);
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root); configureWebView();
    }

    private void configureInsets() {
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
        } else root.setFitsSystemWindows(true);
        root.requestApplyInsets();
    }

    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false); settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(true);
        settings.setSafeBrowsingEnabled(true); settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager cookies = CookieManager.getInstance(); cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return !UrlPolicy.isInScope(server, request.getUrl().toString());
                return routeNavigation(request.getUrl().toString());
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (!UrlPolicy.isInScope(server, url)) {
                    view.stopLoading(); showError("页面地址不属于已配置的工作台。", false); return;
                }
                lastPageUrl = url; clearError(); loading.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush(); loading.setVisibility(View.INVISIBLE);
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel(); showError("安全连接失败，请检查服务器的 HTTPS 证书和手机日期，然后重试。", false);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("连接不到工作台，请检查网络或服务器后重试。", false);
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) showError("服务器返回 HTTP " + response.getStatusCode() + "，请检查工作台地址后重试。", false);
            }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                rendererFailed = true; showError("网页进程已关闭，请重新打开工作台。", true); return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int progress) { loading.setProgress(progress); }
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!UrlPolicy.isInScope(server, view.getUrl())) { callback.onReceiveValue(null); return true; }
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                List<String> types = new ArrayList<>();
                for (String accepted : params.getAcceptTypes()) {
                    if (accepted.startsWith(".")) accepted = MimeTypeMap.getSingleton().getMimeTypeFromExtension(accepted.substring(1).toLowerCase(Locale.ROOT));
                    if (accepted != null && accepted.matches("[A-Za-z0-9!#$&^_.+*-]+/[A-Za-z0-9!#$&^_.+*-]+")) types.add(accepted);
                }
                intent.setType(types.size() == 1 ? types.get(0) : "*/*");
                if (types.size() > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(intent, PICK_FILES); }
                catch (ActivityNotFoundException ex) { fileCallback.onReceiveValue(null); fileCallback = null; toast("手机没有可用的文件选择器。"); }
                return true;
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, android.os.Message result) {
                if (!userGesture) return false;
                WebView popup = new WebView(MainActivity.this); popups.add(popup);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        routePopup(popup, request.getUrl().toString()); return true;
                    }
                    @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                        if (!"about:blank".equals(url)) routePopup(popup, url);
                    }
                });
                ((WebView.WebViewTransport) result.obj).setWebView(popup); result.sendToTarget();
                main.postDelayed(() -> disposePopup(popup), 10000); return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (!UrlPolicy.isInScope(server, url)) { toast("仅可下载当前工作台中的文件。"); return; }
            if (length > MAX_DOWNLOAD_BYTES) { toast("文件超过30MB，未开始下载。"); return; }
            if (pendingDownload != null || downloadInProgress) { toast("请先完成当前文件保存。"); return; }
            String filename = DownloadNames.choose(disposition, URLUtil.guessFileName(url, null, mime));
            String saveMime = mime;
            if (saveMime == null || saveMime.trim().isEmpty() || saveMime.equalsIgnoreCase("application/octet-stream")) {
                int dot = filename.lastIndexOf('.');
                saveMime = dot >= 0 ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(filename.substring(dot + 1).toLowerCase(Locale.ROOT)) : null;
            }
            pendingDownload = new DownloadRequest(server, url, agent);
            Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(saveMime != null && saveMime.matches("[A-Za-z0-9!#$&^_.+*-]+/[A-Za-z0-9!#$&^_.+*-]+") ? saveMime : "application/octet-stream")
                    .putExtra(Intent.EXTRA_TITLE, filename);
            try { startActivityForResult(save, SAVE_FILE); }
            catch (ActivityNotFoundException ex) { pendingDownload = null; toast("手机没有可用的文件保存器。"); }
        });
    }

    private boolean routeNavigation(String url) {
        if (UrlPolicy.isInScope(server, url)) return false;
        if (UrlPolicy.isHttpLink(url)) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
            catch (ActivityNotFoundException ex) { toast("手机没有可用的浏览器。"); }
        } else toast("该链接类型不能在工作台中打开。");
        return true;
    }
    private void routePopup(WebView popup, String url) {
        if (UrlPolicy.isInScope(server, url)) web.loadUrl(url); else routeNavigation(url);
        main.post(() -> disposePopup(popup));
    }
    private void disposePopup(WebView popup) {
        if (popups.remove(popup)) { popup.stopLoading(); popup.destroy(); }
    }
    private void clearError() {
        if (errorView != null) { content.removeView(errorView); errorView = null; }
        web.setVisibility(View.VISIBLE);
    }
    private void showError(String message, boolean restart) {
        if (isFinishing() || isDestroyed()) return;
        if (errorView != null) content.removeView(errorView);
        loading.setVisibility(View.INVISIBLE); web.setVisibility(View.INVISIBLE);
        LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER); panel.setPadding(dp(28), dp(20), dp(28), dp(20)); panel.setBackgroundColor(BG);
        TextView heading = text("暂时无法打开工作台", 22); panel.addView(heading);
        TextView details = text(message, 16); details.setPadding(0, dp(16), 0, dp(20)); panel.addView(details);
        panel.addView(button(restart ? "重新打开" : "重试", v -> { if (rendererFailed) recreate(); else reloadWorkspace(); }));
        panel.addView(button("设置服务器地址", v -> showServerDialog()));
        errorView = panel; content.addView(panel, new FrameLayout.LayoutParams(-1, -1));
    }
    private void showSetup() {
        showError("先填写你的服务器 HTTPS 地址，登录后即可使用同一份聊天和任务记录。", false);
        main.post(this::showServerDialog);
    }
    private void reloadWorkspace() {
        if (rendererFailed) { recreate(); return; }
        if (server.isEmpty()) { showServerDialog(); return; }
        clearError(); web.loadUrl(UrlPolicy.isInScope(server, lastPageUrl) ? lastPageUrl : server);
    }
    private void showServerDialog() {
        LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL); panel.setPadding(dp(24), dp(8), dp(24), 0);
        TextView label = text("填写完整的工作台 HTTPS 地址。聊天和任务保存在服务器。", 15); panel.addView(label);
        EditText input = new EditText(this); input.setSingleLine(true); input.setHint("https://服务器地址/deepseek/");
        input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        input.setText(server); input.setSelectAllOnFocus(true); panel.addView(input);
        TextView note = text("此安装版不包含 Android 锁屏消息推送。提醒结果会保存在工作台中。", 13);
        note.setPadding(0, dp(10), 0, dp(6)); panel.addView(note);
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("服务器设置").setView(panel)
                .setNegativeButton("取消", null).setPositiveButton("连接", null).create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                String normalized = UrlPolicy.normalizeServer(input.getText().toString());
                server = normalized; lastPageUrl = normalized; preferences.edit().putString("server", server).apply();
                CookieManager.getInstance().flush(); web.stopLoading(); web.clearHistory(); clearError(); web.loadUrl(server); dialog.dismiss();
            } catch (IllegalArgumentException ex) { input.setError(ex.getMessage()); }
        }));
        dialog.show();
    }

    private void handleBack() {
        if (web != null && !rendererFailed && web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }
    // API 33+ uses the dispatcher registered in onCreate; this is the 26-32 fallback.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { handleBack(); }
    @Override protected void onPause() {
        CookieManager.getInstance().flush(); if (!rendererFailed) web.onPause(); super.onPause();
    }
    @Override protected void onResume() { super.onResume(); if (web != null && !rendererFailed) web.onResume(); }
    @Override protected void onSaveInstanceState(Bundle out) {
        if (web != null && !rendererFailed) { Bundle saved = new Bundle(); web.saveState(saved); out.putBundle("web", saved); }
        if (pendingDownload != null) {
            Bundle pending = new Bundle(); pending.putString("base", pendingDownload.base);
            pending.putString("url", pendingDownload.url); pending.putString("agent", pendingDownload.agent);
            out.putBundle("pending_download", pending);
        }
        super.onSaveInstanceState(out);
    }
    @Override protected void onDestroy() {
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        for (WebView popup : new HashSet<>(popups)) disposePopup(popup);
        if (web != null) { content.removeView(web); web.destroy(); }
        downloads.shutdown(); super.onDestroy();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILES && fileCallback != null) {
            List<Uri> picked = new ArrayList<>();
            if (result == RESULT_OK && data != null) {
                ClipData clips = data.getClipData();
                if (clips != null) for (int i = 0; i < Math.min(10, clips.getItemCount()); i++) addContentUri(picked, clips.getItemAt(i).getUri());
                else addContentUri(picked, data.getData());
            }
            fileCallback.onReceiveValue(picked.isEmpty() ? null : picked.toArray(new Uri[0])); fileCallback = null;
        } else if (request == SAVE_FILE) {
            DownloadRequest download = pendingDownload; pendingDownload = null;
            if (result == RESULT_OK && data != null && data.getData() != null) {
                Uri destination = data.getData();
                if (!"content".equals(destination.getScheme())) { toast("文件保存位置无效。"); return; }
                if (download == null) {
                    downloads.submit(() -> { try { android.provider.DocumentsContract.deleteDocument(getContentResolver(), destination); } catch (Exception ignored) { } });
                    toast("页面已重新打开，请再点击一次文件下载。"); return;
                }
                downloadInProgress = true; toast("正在保存文件…");
                downloads.submit(() -> saveDownload(download, destination));
            }
        }
    }
    private static void addContentUri(List<Uri> result, Uri uri) {
        if (uri != null && "content".equals(uri.getScheme())) result.add(uri);
    }

    private void saveDownload(DownloadRequest request, Uri destination) {
        HttpsURLConnection connection = null;
        try {
            String target = request.url;
            for (int hop = 0; ; hop++) {
                if (!UrlPolicy.isInScope(request.base, target)) throw new IllegalStateException("下载跳转离开了当前工作台，未发送登录信息。");
                connection = (HttpsURLConnection) new URL(target).openConnection();
                connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
                connection.setRequestProperty("Accept-Encoding", "identity");
                if (request.agent != null) connection.setRequestProperty("User-Agent", request.agent);
                String cookie = CookieManager.getInstance().getCookie(target);
                if (cookie != null && !cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    if (hop >= 4) throw new IllegalStateException("下载重定向过多。");
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IllegalStateException("下载跳转地址无效。");
                    target = new URL(new URL(target), location).toString(); connection.disconnect(); connection = null; continue;
                }
                if (status == 401 || status == 403) throw new IllegalStateException("登录已失效，请在工作台重新登录后下载。");
                if (status != 200) throw new IllegalStateException("下载失败：HTTP " + status + "。");
                String type = connection.getContentType();
                if (type != null && type.toLowerCase(Locale.ROOT).contains("text/html")) throw new IllegalStateException("服务器返回了网页，未把它保存为文件。请检查登录状态。");
                if (connection.getContentLengthLong() > MAX_DOWNLOAD_BYTES) throw new IllegalStateException("文件超过30MB限制。");
                try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream())) {
                    input.mark(1024); byte[] prefix = new byte[512]; int count = input.read(prefix); input.reset();
                    String start = new String(prefix, 0, Math.max(0, count), StandardCharsets.UTF_8).trim().toLowerCase(Locale.ROOT);
                    if (start.startsWith("<!doctype html") || start.startsWith("<html")) throw new IllegalStateException("服务器返回了网页，未保存为文件。");
                    try (OutputStream output = getContentResolver().openOutputStream(destination, "wt")) {
                        if (output == null) throw new IllegalStateException("无法打开保存位置。");
                        byte[] buffer = new byte[32768]; long total = 0; int length;
                        while ((length = input.read(buffer)) != -1) {
                            total += length; if (total > MAX_DOWNLOAD_BYTES) throw new IllegalStateException("文件超过30MB限制。");
                            output.write(buffer, 0, length);
                        }
                    }
                }
                main.post(() -> toast("文件已保存。")); break;
            }
        } catch (Exception error) {
            // The destination was created for this download, never an existing user file.
            try { android.provider.DocumentsContract.deleteDocument(getContentResolver(), destination); } catch (Exception ignored) { }
            String detail = error instanceof IllegalStateException ? error.getMessage() : "保存失败，请检查网络和登录状态后重试。";
            main.post(() -> { if (!isFinishing() && !isDestroyed()) new AlertDialog.Builder(this).setTitle("文件未保存").setMessage(detail).setPositiveButton("知道了", null).show(); });
        } finally {
            if (connection != null) connection.disconnect(); main.post(() -> downloadInProgress = false);
        }
    }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private static final class DownloadRequest {
        final String base, url, agent;
        DownloadRequest(String base, String url, String agent) { this.base = base; this.url = url; this.agent = agent; }
    }
}
