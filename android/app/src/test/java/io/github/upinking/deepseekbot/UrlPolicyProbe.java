package io.github.upinking.deepseekbot;

/** No Android device or test dependency is needed for these URL boundary checks. */
public final class UrlPolicyProbe {
    private static int checks;

    public static void main(String[] args) {
        equal("https://example.com/deepseek/", UrlPolicy.normalizeServer("  HTTPS://EXAMPLE.com:443/deepseek  "));
        equal("https://example.com/", UrlPolicy.normalizeServer("https://example.com"));
        equal("https://example.com:8443/app/", UrlPolicy.normalizeServer("https://example.com:8443/app/"));
        equal("https://[2001:db8::1]:8443/app/", UrlPolicy.normalizeServer("https://[2001:db8::1]:8443/app"));
        String base = "https://example.com/deepseek/";
        yes(UrlPolicy.isInScope(base, "https://example.com/deepseek"));
        yes(UrlPolicy.isInScope(base, "https://EXAMPLE.com:443/deepseek/api/files/123/download?x=a%20b#result"));
        yes(UrlPolicy.isInScope(base, "https://example.com/deepseek/"));
        yes(UrlPolicy.isInScope("https://example.com/", "https://example.com/other/path"));
        yes(UrlPolicy.isInScope("https://[2001:db8::1]:8443/app/", "https://[2001:db8::1]:8443/app/file"));
        no(UrlPolicy.isInScope(base, "https://example.com/deepseek-evil/"));
        no(UrlPolicy.isInScope(base, "https://example.com/elsewhere/"));
        no(UrlPolicy.isInScope(base, "https://example.com.evil.test/deepseek/"));
        no(UrlPolicy.isInScope(base, "https://example.com:8443/deepseek/"));
        no(UrlPolicy.isInScope(base, "http://example.com/deepseek/"));
        no(UrlPolicy.isInScope(base, "https://example.com@evil.test/deepseek/"));
        no(UrlPolicy.isInScope(base, "https://example.com/deepseek/../private"));
        no(UrlPolicy.isInScope(base, "https://example.com/deepseek/%2e%2E/private"));
        no(UrlPolicy.isInScope(base, "https://example.com/deepseek/%252e%252e/private"));
        no(UrlPolicy.isInScope(base, "https://example.com/deepseek%2fprivate"));
        no(UrlPolicy.isInScope(base, "https://example.com/deepseek/%5c..%5cprivate"));
        no(UrlPolicy.isInScope(base, "https://example.com/deepseek/%00private"));
        no(UrlPolicy.isInScope(base, "https://example.com/deepseek/\nprivate"));
        no(UrlPolicy.isInScope(base, "https:\\example.com/deepseek/"));
        no(UrlPolicy.isInScope(base, "javascript:alert(1)"));
        no(UrlPolicy.isInScope(base, "https://example.com:0/deepseek/"));
        yes(UrlPolicy.isHttpLink("http://external.test/article?q=1"));
        yes(UrlPolicy.isHttpLink("https://external.test/article"));
        no(UrlPolicy.isHttpLink("file:///etc/passwd"));
        no(UrlPolicy.isHttpLink("intent://example.com"));
        no(UrlPolicy.isHttpLink("https:evil.test"));
        no(UrlPolicy.isHttpLink("https://user:password@example.com/"));
        no(UrlPolicy.isHttpLink("https://example.com:65536/"));
        reject("http://example.com/app");
        reject("https://example.com/app?token=secret");
        reject("https://example.com/app#section");
        reject("https://example.com/app/../elsewhere");
        reject("https://example.com/app/%2e/elsewhere");
        reject("https://user@example.com/app");
        reject("https://example.com:99999/app");
        reject("https://example.com/app%2fprivate");
        reject("https://example.com/app/%20space");
        reject("https://example.com/app/%252Fprivate");
        reject("https://example.com\\@evil.test/app");
        reject("example.com/app");
        reject("");
        reject(null);
        System.out.println("UrlPolicyProbe: " + checks + " checks passed");
    }

    private static void reject(String raw) {
        checks++;
        try {
            UrlPolicy.normalizeServer(raw);
            throw new AssertionError("accepted invalid server URL");
        } catch (IllegalArgumentException expected) {
            // Expected: malformed or ambiguous deployment URL.
        }
    }

    private static void equal(String expected, String actual) {
        checks++;
        if (!expected.equals(actual)) throw new AssertionError(expected + " != " + actual);
    }
    private static void yes(boolean value) { checks++; if (!value) throw new AssertionError("expected true"); }
    private static void no(boolean value) { checks++; if (value) throw new AssertionError("expected false"); }
}
