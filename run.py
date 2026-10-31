import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run("botapp.main:create_app", factory=True, host=os.getenv("BOT_HOST","127.0.0.1"), port=int(os.getenv("BOT_PORT","8765")), proxy_headers=True, forwarded_allow_ips="127.0.0.1")
