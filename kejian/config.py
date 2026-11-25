"""路径与设置。设置保存在项目根目录的 config.local.json（已加入 .gitignore）。"""
import json
import os
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = Path(__file__).resolve().parent / "web"
LIBRARY = Path(os.environ.get("KEJIAN_LIBRARY", ROOT / "library")).resolve()
EXAMPLES = ROOT / "examples"
CONFIG_FILE = Path(os.environ.get("KEJIAN_CONFIG", ROOT / "config.local.json"))

DEFAULTS = {
    # web（网页版 AI，复制粘贴）| claude-cli（本机 Claude Code）| anthropic | openai 兼容 | outline
    "provider": "web",
    "model": "claude-opus-5-5",
    "base_url": "",
    "api_key": "",
    "effort": "medium",          # Claude 的推理强度：low / medium / high
    "language": "zh",            # 界面 + 讲解 + 释义语言：zh / en
    "lang_chosen": False,        # 是否已在首次打开时选过语言
    "send_images": True,         # 把幻灯片图片一起发给模型（图表页更准确）
    "concurrency": 3,
    "batch": 8,                  # 网页版模式每次处理的页数
    "cli_model": "",             # Claude Code 模式的模型（留空用账号默认）
}

# 各服务商的推荐默认值，供前端一键填充
PRESETS = {
    "web": {"label": "网页版 ChatGPT / Claude / Kimi…（复制粘贴，无需 Key）", "model": "", "base_url": ""},
    "claude-cli": {"label": "本机 Claude Code（用 Claude 订阅账号）", "model": "", "base_url": ""},
    "anthropic": {"label": "Claude (Anthropic)", "model": "claude-opus-5-5", "base_url": ""},
    "openai": {"label": "OpenAI", "model": "gpt-5", "base_url": ""},
    "deepseek": {"label": "DeepSeek", "model": "deepseek-chat", "base_url": "https://api.deepseek.com"},
    "qwen": {"label": "通义千问", "model": "qwen-vl-max", "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    "moonshot": {"label": "Kimi", "model": "moonshot-v1-32k", "base_url": "https://api.moonshot.cn/v1"},
    "ollama": {"label": "Ollama (本地)", "model": "qwen2.5:14b", "base_url": "http://localhost:11434/v1"},
    "outline": {"label": "离线提纲（不调用 AI）", "model": "", "base_url": ""},
}

_lock = threading.Lock()


def load_settings() -> dict:
    s = dict(DEFAULTS)
    try:
        s.update(json.loads(CONFIG_FILE.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        pass
    return s


def save_settings(patch: dict) -> dict:
    with _lock:
        s = load_settings()
        for k, v in patch.items():
            if k in DEFAULTS:
                s[k] = v
        CONFIG_FILE.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")
        return s


def public_settings(s: dict | None = None) -> dict:
    """返回给前端的设置：API Key 只显示是否已配置。"""
    s = dict(s or load_settings())
    key = s.pop("api_key", "")
    env = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}.get(s["provider"], "OPENAI_API_KEY")
    s["api_key_set"] = bool(key)
    s["api_key_hint"] = (key[:4] + "…" + key[-4:]) if len(key) > 12 else ("已设置" if key else "")
    s["env_key_set"] = bool(os.environ.get(env))
    s["presets"] = PRESETS
    return s
