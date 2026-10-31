package io.github.upinking.deepseekbot;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** URL boundaries shared by navigation and authenticated file downloads. */
public final class UrlPolicy {
    private UrlPolicy() {}

    public static String normalizeServer(String raw) {
        URI uri = parse(raw == null ? null : raw.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("服务器地址必须以 https:// 开头");
        }
        if (uri.getRawQuery() != null || uri.getRawFragment() != null) {
            throw new IllegalArgumentException("服务器地址不应包含查询参数或 # 标记");
        }
        String path = checkedPath(uri);
        if (!path.endsWith("/")) path += "/";
        int port = uri.getPort() == 443 ? -1 : uri.getPort();
        try {
            return new URI("https", null, uri.getHost().toLowerCase(Locale.ROOT),
                    port, path, null, null).toASCIIString();
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException("服务器地址格式不正确", exception);
        }
    }

    public static boolean isInScope(String configuredBase, String candidate) {
        try {
            URI base = new URI(normalizeServer(configuredBase));
            URI target = parse(candidate);
            if (!"https".equalsIgnoreCase(target.getScheme())
                    || !base.getHost().equalsIgnoreCase(target.getHost())
                    || effectivePort(base) != effectivePort(target)) {
                return false;
            }
            String root = checkedPath(base);
            String path = checkedPath(target);
            return path.startsWith(root)
                    || (root.length() > 1 && path.equals(root.substring(0, root.length() - 1)));
        } catch (IllegalArgumentException | URISyntaxException exception) {
            return false;
        }
    }

    /** External navigation is allowed only to ordinary, credential-free web URLs. */
    public static boolean isHttpLink(String candidate) {
        try {
            URI uri = parse(candidate);
            return "https".equalsIgnoreCase(uri.getScheme())
                    || "http".equalsIgnoreCase(uri.getScheme());
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private static URI parse(String raw) {
        if (raw == null || raw.isEmpty() || raw.indexOf('\\') >= 0) {
            throw new IllegalArgumentException("请输入完整的 HTTPS 服务器地址");
        }
        for (int i = 0; i < raw.length(); i++) {
            char character = raw.charAt(i);
            if (character <= 0x20 || character == 0x7f) {
                throw new IllegalArgumentException("地址中不能包含空格或控制字符");
            }
        }
        try {
            URI uri = new URI(raw);
            if (!uri.isAbsolute() || uri.isOpaque() || uri.getHost() == null
                    || uri.getHost().isEmpty() || uri.getRawUserInfo() != null
                    || uri.getHost().indexOf('%') >= 0
                    || uri.getPort() == 0 || uri.getPort() > 65535) {
                throw new IllegalArgumentException("地址必须包含有效主机，且不能嵌入账号或密码");
            }
            return uri;
        } catch (URISyntaxException exception) {
            throw new IllegalArgumentException("服务器地址格式不正确", exception);
        }
    }

    private static String checkedPath(URI uri) {
        String raw = uri.getRawPath();
        if (raw == null || raw.isEmpty()) return "/";
        String lower = raw.toLowerCase(Locale.ROOT);
        // These characters can acquire a second meaning after proxy decoding.
        for (String encoded : new String[]{"%2f", "%5c", "%25", "%3f", "%23"}) {
            if (lower.contains(encoded)) throw new IllegalArgumentException("地址路径包含不安全的编码");
        }
        String path = uri.getPath();
        for (int i = 0; i < path.length(); i++) {
            char character = path.charAt(i);
            if (character <= 0x20 || character == 0x7f || character == '\\') {
                throw new IllegalArgumentException("地址路径包含无效字符");
            }
        }
        for (String segment : path.split("/", -1)) {
            if (segment.equals(".") || segment.equals("..")) {
                throw new IllegalArgumentException("地址路径不能包含 . 或 .. 跳转");
            }
        }
        if (!path.startsWith("/")) throw new IllegalArgumentException("地址路径格式不正确");
        return path;
    }

    private static int effectivePort(URI uri) {
        return uri.getPort() == -1 ? 443 : uri.getPort();
    }
}
