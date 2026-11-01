import base64

from fastapi.testclient import TestClient

from botapp.main import create_app
from botapp.profile import MAX_AVATAR_BYTES


PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVbcAAAAASUVORK5CYII="


def login(client, directory):
    password = (directory / "bootstrap-password.txt").read_text().strip()
    assert client.post("/api/auth/login", json={"password": password}).status_code == 200


def test_profile_is_private_and_survives_restart(tmp_path):
    client = TestClient(create_app(tmp_path, runtime_enabled=False))
    assert client.get("/api/profile").status_code == 401
    assert client.put("/api/profile", json={"display_name": "访客"}).status_code == 401
    login(client, tmp_path)
    assert client.get("/api/profile").json() == {"display_name": "我", "avatar_data": ""}
    assert client.put("/api/profile", json={"display_name": "  我的名字  ", "avatar_data": PNG}).json() == {
        "display_name": "我的名字", "avatar_data": PNG,
    }
    response = client.get("/api/profile")
    assert response.headers["cache-control"] == "no-store"
    assert client.put("/api/profile", json={"display_name": "坏来源"}, headers={"Origin": "https://evil.invalid"}).status_code == 403
    client = TestClient(create_app(tmp_path, runtime_enabled=False))
    login(client, tmp_path)
    assert client.get("/api/profile").json() == {"display_name": "我的名字", "avatar_data": PNG}
    assert client.put("/api/profile", json={"avatar_data": ""}).json() == {"display_name": "我的名字", "avatar_data": ""}
    client.post("/api/auth/logout")
    assert client.get("/api/profile").status_code == 401


def test_bad_profile_updates_are_rejected_atomically(tmp_path):
    app = create_app(tmp_path, runtime_enabled=False)
    client = TestClient(app)
    login(client, tmp_path)
    client.put("/api/profile", json={"display_name": "保留名字", "avatar_data": PNG})
    oversized = "data:image/png;base64," + base64.b64encode(b"x" * (MAX_AVATAR_BYTES + 1)).decode()
    invalid = [
        {"display_name": "   "}, {"display_name": "名" * 65}, {"display_name": None},
        {"avatar_data": "https://example.com/avatar.png"},
        {"avatar_data": "data:image/svg+xml;base64,PHN2Zy8+"},
        {"avatar_data": PNG.replace("image/png", "image/jpeg")},
        {"avatar_data": "data:image/png;base64,YmFk"},
        {"avatar_data": "data:image/png;base64,%%%"},
        {"display_name": "不应写入", "avatar_data": oversized},
        {"api_key": "not-a-profile-field"}, [], None,
    ]
    for body in invalid:
        assert client.put("/api/profile", json=body).status_code == 400
        assert client.get("/api/profile").json() == {"display_name": "保留名字", "avatar_data": PNG}
    assert client.put("/api/profile", content=b"{").status_code == 400
    assert app.state.store.api_key == ""
