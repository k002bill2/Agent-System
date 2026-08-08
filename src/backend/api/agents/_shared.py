"""Agents API 모듈들이 공유하는 상수.

이미지 업로드 제약은 OCR(core)과 orchestrate(analyze-with-images) 양쪽이
쓰므로 어느 한쪽 소유로 두지 않는다.

순환 import 를 막기 위해 이 모듈은 형제 모듈을 import 하지 않는다 —
의존은 항상 한 방향(형제 → `_shared`)이다.
"""

import os
from pathlib import Path

# Image upload directory
UPLOAD_DIR = Path(os.getenv("AOS_UPLOAD_DIR", "/tmp/aos-uploads"))
ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
MAX_IMAGE_SIZE = 20 * 1024 * 1024  # 20MB per image
MAX_IMAGES = 5
