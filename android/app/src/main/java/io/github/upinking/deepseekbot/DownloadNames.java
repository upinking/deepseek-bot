package io.github.upinking.deepseekbot;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Keep the attachment's actual name even when its MIME type is octet-stream. */
public final class DownloadNames {
    private static final int MAX_CODE_POINTS = 180;
    private DownloadNames() {}

    public static String choose(String disposition, String fallback) {
        String extended = parameter(disposition, "filename*");
        String decoded = decodeExtended(extended);
        if (decoded != null && !decoded.trim().isEmpty()) return safeName(decoded);
        String plain = parameter(disposition, "filename");
        if (plain != null && !plain.trim().isEmpty()) return safeName(plain);
        return safeName(fallback == null ? "download" : fallback);
    }

    private static String parameter(String header, String wanted) {
        if (header == null) return null;
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false, escaped = false;
        for (int i = 0; i < header.length(); i++) {
            char c = header.charAt(i);
            if (escaped) { field.append(c); escaped = false; continue; }
            if (quoted && c == '\\') { field.append(c); escaped = true; continue; }
            if (c == '"') quoted = !quoted;
            if (c == ';' && !quoted) { fields.add(field.toString()); field.setLength(0); }
            else field.append(c);
        }
        if (!quoted && !escaped) fields.add(field.toString());
        for (String entry : fields) {
            int equals = entry.indexOf('=');
            if (equals < 0 || !entry.substring(0, equals).trim().equalsIgnoreCase(wanted)) continue;
            String value = entry.substring(equals + 1).trim();
            if (!value.startsWith("\"")) return value.indexOf('"') < 0 ? value : null;
            if (value.length() < 2 || !value.endsWith("\"")) return null;
            StringBuilder result = new StringBuilder();
            for (int i = 1; i < value.length() - 1; i++) {
                char c = value.charAt(i);
                if (c == '\\' && i + 1 < value.length() - 1) c = value.charAt(++i);
                else if (c == '"') return null;
                result.append(c);
            }
            return result.toString();
        }
        return null;
    }

    private static String decodeExtended(String value) {
        if (value == null) return null;
        int first = value.indexOf('\''), second = value.indexOf('\'', first + 1);
        if (first <= 0 || second < 0 || !value.substring(0, first).equalsIgnoreCase("UTF-8")) return null;
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (int i = second + 1; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '%') {
                if (i + 2 >= value.length()) return null;
                int high = Character.digit(value.charAt(++i), 16), low = Character.digit(value.charAt(++i), 16);
                if (high < 0 || low < 0) return null;
                bytes.write(high * 16 + low);
            } else {
                if (c > 127) return null;
                bytes.write(c); // '+' is a literal plus, unlike form URL encoding.
            }
        }
        try {
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString();
        } catch (CharacterCodingException exception) { return null; }
    }

    private static String safeName(String source) {
        StringBuilder value = new StringBuilder();
        source.codePoints().forEach(c -> value.appendCodePoint(c == '/' || c == '\\'
                || Character.isISOControl(c) || Character.getType(c) == Character.FORMAT ? '_' : c));
        String name = value.toString().trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) return "download";
        int points = name.codePointCount(0, name.length());
        if (points > MAX_CODE_POINTS) {
            int dot = name.lastIndexOf('.');
            String suffix = dot > 0 && name.length() - dot <= 16 ? name.substring(dot) : "";
            int keep = MAX_CODE_POINTS - suffix.codePointCount(0, suffix.length());
            name = name.substring(0, name.offsetByCodePoints(0, keep)) + suffix;
        }
        return name;
    }
}
