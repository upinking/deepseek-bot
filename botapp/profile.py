"""Private single-user profile, independent of model credentials."""

import base64
import binascii
import re
import struct


MAX_AVATAR_BYTES = 256 * 1024
MAX_PROFILE_BODY_BYTES = ((MAX_AVATAR_BYTES + 2) // 3) * 4 + 2048
AVATAR_DATA = re.compile(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})\Z")


def read_profile(store):
    profile = store.get_setting("user_profile", {})
    if not isinstance(profile, dict):
        profile = {}
    return {
        "display_name": profile.get("display_name") or "我",
        "avatar_data": profile.get("avatar_data") or "",
    }


def validate_avatar(value):
    if not isinstance(value, str):
        raise ValueError("头像必须是 PNG、JPEG 或 WebP 图片")
    if value == "":
        return value
    if len(value) > MAX_PROFILE_BODY_BYTES:
        raise ValueError("头像超过 256KB，请缩小图片后重试")
    match = AVATAR_DATA.fullmatch(value)
    if not match:
        raise ValueError("头像必须是 PNG、JPEG 或 WebP 图片")
    try:
        image = base64.b64decode(match[2], validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("头像图片编码无效") from None
    if len(image) > MAX_AVATAR_BYTES:
        raise ValueError("头像超过 256KB，请缩小图片后重试")
    mime = match[1]
    if mime == "png":
        valid = (
            len(image) >= 45 and image.startswith(b"\x89PNG\r\n\x1a\n")
            and image[8:16] == b"\x00\x00\x00\rIHDR"
            and image.endswith(b"\x00\x00\x00\x00IEND\xaeB`\x82")
        )
        if valid:
            width, height = struct.unpack(">II", image[16:24])
            valid = 0 < width <= 4096 and 0 < height <= 4096
    elif mime == "jpeg":
        valid = len(image) >= 20 and image.startswith(b"\xff\xd8\xff") and image.endswith(b"\xff\xd9")
    else:
        valid = (
            len(image) >= 20 and image.startswith(b"RIFF") and image[8:12] == b"WEBP"
            and image[12:16] in {b"VP8 ", b"VP8L", b"VP8X"}
            and struct.unpack("<I", image[4:8])[0] == len(image) - 8
        )
    if not valid:
        raise ValueError("头像内容与图片格式不匹配，或图片已损坏")
    return value


def update_profile(store, body):
    if not isinstance(body, dict) or set(body) - {"display_name", "avatar_data"}:
        raise ValueError("个人资料只接受名字和头像")
    profile = read_profile(store)
    if "display_name" in body:
        name = body["display_name"]
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 64:
            raise ValueError("名字需要 1 到 64 个字符")
        profile["display_name"] = name.strip()
    if "avatar_data" in body:
        profile["avatar_data"] = validate_avatar(body["avatar_data"])
    store.set_setting("user_profile", profile)
    return profile
