package io.github.upinking.deepseekbot;

public final class DownloadNamesProbe {
    private static int checks;
    private static void check(String expected, String header, String fallback) {
        String actual = DownloadNames.choose(header, fallback);
        if (!expected.equals(actual)) throw new AssertionError("expected " + expected + ", got " + actual);
        checks++;
    }
    public static void main(String[] args) {
        check("android-upload.txt", "attachment; filename=\"android-upload.txt\"", "android-upload.bin");
        check("报告.txt", "attachment; filename=\"fallback.bin\"; filename*=UTF-8''%E6%8A%A5%E5%91%8A.txt", "download.bin");
        check("报告+清单.md", "attachment; FILENAME*=utf-8'zh'%E6%8A%A5%E5%91%8A+%E6%B8%85%E5%8D%95.md", "x.bin");
        check("a+b.txt", "attachment; filename*=UTF-8''a%2Bb.txt", "x.bin");
        check("a;b.txt", "attachment; filename=\"a;b.txt\"", "x.bin");
        check("a\"b.txt", "attachment; filename=\"a\\\"b.txt\"", "x.bin");
        check("safe.txt", "attachment; note=\"x; filename=evil.bin\"; filename=\"safe.txt\"", "x.bin");
        check("safe.txt", "attachment; filename*=UTF-8''%GG; filename=\"safe.txt\"", "x.bin");
        check("safe.txt", "attachment; filename*=UTF-8''%C3%28; filename=\"safe.txt\"", "x.bin");
        check("safe.txt", "attachment; filename*=ISO-8859-1''caf%E9.txt; filename=safe.txt", "x.bin");
        check("x.bin", "attachment; filename*=UTF-8''broken%", "x.bin");
        check("x.txt", "attachment; filename=\"unterminated", "x.txt");
        check("x.txt", "attachment; filename=\"\"", "x.txt");
        check("x.txt", null, "x.txt");
        check("download", null, null);
        check("download", "attachment; filename=\"..\"", "x.bin");
        check(".._secret.txt", "attachment; filename*=UTF-8''..%2Fsecret.txt", "x.bin");
        check("a_b.txt", "attachment; filename*=UTF-8''a%5Cb.txt", "x.bin");
        check("a_b.txt", "attachment; filename*=UTF-8''a%00b.txt", "x.bin");
        check("a_b.txt", "attachment; filename=\"a\u202Eb.txt\"", "x.bin");
        String longName = "a".repeat(250) + ".txt";
        check("a".repeat(176) + ".txt", "attachment; filename=\"" + longName + "\"", "x.bin");
        String emoji = "\uD83D\uDE00";
        check(emoji.repeat(176) + ".txt", "attachment; filename=\"" + emoji.repeat(200) + ".txt\"", "x.bin");
        System.out.println("DownloadNamesProbe: " + checks + " checks passed");
    }
}
