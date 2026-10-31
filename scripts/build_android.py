"""Build a signed personal APK; private settings and keys stay outside Git."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile
import urllib.parse

ROOT = Path(__file__).resolve().parent.parent
ANDROID = ROOT / "android"


def main():
    parser = argparse.ArgumentParser(description="构建 DeepSeek Bot Android 安装包")
    parser.add_argument("--offline", action="store_true", help="仅使用已下载的构建依赖")
    parser.add_argument("--debug", action="store_true", help="构建仅用于调试的 APK")
    parser.add_argument("--generic", action="store_true", help="不预置个人服务器，首次打开手动填写")
    args = parser.parse_args()
    sdk_candidates = [os.getenv("ANDROID_HOME", ""), os.getenv("ANDROID_SDK_ROOT", ""),
                      str(Path.home() / "Library/Android/sdk"), str(Path.home() / "Android/Sdk")]
    sdk = next((Path(p) for p in sdk_candidates if p and (Path(p) / "platforms/android-36/android.jar").is_file()), None)
    if sdk is None:
        raise SystemExit("请先安装 Android SDK 36，并设置 ANDROID_HOME。")
    package = Path("io/github/upinking/deepseekbot")
    with tempfile.TemporaryDirectory(prefix="deepseek-android-url-check-") as temporary:
        subprocess.run(["javac", "-d", temporary,
                        str(ANDROID / "app/src/main/java" / package / "UrlPolicy.java"),
                        str(ANDROID / "app/src/main/java" / package / "DownloadNames.java"),
                        str(ANDROID / "app/src/test/java" / package / "UrlPolicyProbe.java"),
                        str(ANDROID / "app/src/test/java" / package / "DownloadNamesProbe.java")], check=True)
        for probe in ("UrlPolicyProbe", "DownloadNamesProbe"):
            subprocess.run(["java", "-cp", temporary, "io.github.upinking.deepseekbot." + probe], check=True)
    (ANDROID / "local.properties").write_text("sdk.dir=" + sdk.as_posix().replace(" ", "\\ ") + "\n")
    signing = ROOT / "data/android-signing"
    signing.mkdir(parents=True, exist_ok=True, mode=0o700)
    props = signing / "signing.properties"
    if not args.debug and not props.exists():
        keystore = signing / "release.keystore"
        if keystore.exists():
            raise SystemExit("签名配置缺失但密钥已存在，请恢复 signing.properties；未覆盖原密钥。")
        password = secrets.token_urlsafe(36)
        env = dict(os.environ, BOT_ANDROID_KEYSTORE_PASSWORD=password)
        subprocess.run(["keytool", "-genkeypair", "-keystore", str(keystore), "-alias", "deepseek-bot",
                        "-storepass:env", "BOT_ANDROID_KEYSTORE_PASSWORD", "-keypass:env", "BOT_ANDROID_KEYSTORE_PASSWORD",
                        "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000",
                        "-dname", "CN=DeepSeek Bot,OU=Personal Apps", "-noprompt"], env=env, check=True)
        props.write_text("storeFile=release.keystore\nkeyAlias=deepseek-bot\nstorePassword=" + password + "\nkeyPassword=" + password + "\n")
        props.chmod(0o600)
        keystore.chmod(0o600)
    command = [str(ANDROID / "gradlew"), "assembleDebug" if args.debug else "assembleRelease", "--console=plain"]
    if args.offline:
        command.append("--offline")
    if not args.generic:
        url_file = ROOT / "data/workspace-url.txt"
        if url_file.exists():
            url = url_file.read_text().strip()
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise SystemExit("私人服务器配置必须是不含账号、查询和片段的 HTTPS 地址。")
            command.append("-PserverUrl=" + url)
    # Java/Gradle do not automatically use the shell's HTTP(S)_PROXY settings.
    proxy = urllib.parse.urlparse(os.getenv("HTTPS_PROXY", os.getenv("https_proxy", "")))
    if proxy.scheme == "http" and proxy.hostname and proxy.port and not proxy.username:
        command += ["-Dhttps.proxyHost=" + proxy.hostname, "-Dhttps.proxyPort=" + str(proxy.port),
                    "-Dhttp.proxyHost=" + proxy.hostname, "-Dhttp.proxyPort=" + str(proxy.port)]
    subprocess.run(command, cwd=ANDROID, check=True)
    variant = "debug" if args.debug else "release"
    apk = ANDROID / f"app/build/outputs/apk/{variant}/app-{variant}.apk"
    if not apk.exists():
        raise SystemExit("没有找到已签名 APK；请检查构建与签名配置。")
    version = re.search(r"versionName\s+'([^']+)'", (ANDROID / "app/build.gradle").read_text()).group(1)
    destination = ROOT / "dist/android" / f"DeepSeekBot-{version}{'-debug' if args.debug else ''}.apk"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(apk, destination)
    checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(".apk.sha256").write_text(checksum + "  " + destination.name + "\n")
    print("APK：" + str(destination))
    print("SHA-256：" + checksum)


if __name__ == "__main__":
    main()
