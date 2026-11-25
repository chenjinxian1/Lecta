"""AI 辅助生成每页讲解。

支持这些引擎（另见 manual.py：网页版复制粘贴模式）：
  * claude-cli —— 调用本机已登录的 Claude Code，用你的 Claude 订阅额度，无需 API Key
  * anthropic —— Claude，官方 anthropic SDK，结构化 JSON 输出 + 提示缓存
  * openai    —— OpenAI 以及所有 OpenAI 兼容接口（DeepSeek、通义、Kimi、Ollama…）
  * outline   —— 不调用 AI，直接把页面文字整理成提纲（无需 API Key）

每页讲解统一为：
  {"t": 标题, "s": 一句话核心, "p": [要点…], "k": [[术语, 释义, 补充]…], "tip": 考点提示}
"""
import base64
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

from . import library

# Claude 的拒答兜底（server-side fallback）只在这些模型上启用
_FALLBACK_MODELS = {"claude-opus-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1", "claude-sonnet-5-5"}

SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "本页的标题（讲解语言）"},
        "gist": {"type": "string", "description": "一句话点出本页最核心的知识"},
        "points": {
            "type": "array",
            "description": "要点，按讲课顺序；level 2 表示上一条的子要点",
            "items": {
                "type": "object",
                "properties": {"text": {"type": "string"}, "level": {"type": "integer", "enum": [1, 2]}},
                "required": ["text", "level"], "additionalProperties": False,
            },
        },
        "terms": {
            "type": "array",
            "description": "本页的关键术语，保留课件原文写法",
            "items": {
                "type": "object",
                "properties": {"term": {"type": "string"}, "meaning": {"type": "string"}, "note": {"type": "string"}},
                "required": ["term", "meaning", "note"], "additionalProperties": False,
            },
        },
        "tip": {"type": "string", "description": "考点 / 易混点 / 记忆方法；没有就留空"},
    },
    "required": ["title", "gist", "points", "terms", "tip"],
    "additionalProperties": False,
}

_LANG = {
    "zh": "用简体中文讲解，专业术语保留英文原文并在括号或术语表里给出中文",
    "en": "Write the explanation in clear, simple English",
}


def system_prompt(language: str) -> str:
    return f"""你是一位耐心、严谨的大学课程助教。学生正在逐页精读一份课件，你要为某一页写“讲解卡片”，帮学生真正看懂并记住这一页。

写作要求：
- {_LANG.get(language, _LANG['zh'])}。
- 依据课件本页内容（文字、图表、演讲者备注）来讲，可以补充必要的背景，但不要编造课件之外的数据、人名或结论。
- gist：一句话说清本页在讲什么、为什么重要。
- points：3–7 条，按讲课顺序，每条一两句话，把课件上的简写展开成学生能看懂的话；列表或分类用 level 2 子要点。
- terms：本页出现的关键术语（0–6 个），term 写课件原文，meaning 写释义，note 可补充易混点或例子（没有就留空字符串）。
- tip：考试可能怎么考、容易混淆什么、怎么记；封面或过渡页可以留空。
- 如果是图表页，要把图里的关键数据或结构讲出来。
- 如果课件本身有错误或前后不一致，在 points 或 tip 里明确指出。
- 直接输出 JSON，不要寒暄。"""


def deck_context(deck: dict) -> str:
    lines = [f"课件：{deck.get('title', '')}", "目录（页码. 标题）："]
    for p in deck["pages"]:
        lines.append(f"{p['n']}. {p.get('title') or '（无标题）'}")
    return "\n".join(lines)


def page_prompt(deck: dict, n: int) -> str:
    p = deck["pages"][n - 1]
    parts = [f"请为第 {n} 页（共 {len(deck['pages'])} 页）写讲解卡片。", "", "【本页文字】", p.get("text") or "（本页没有可提取的文字，请根据图片讲解）"]
    if p.get("notes"):
        parts += ["", "【演讲者备注】", p["notes"]]
    if n > 1:
        parts += ["", f"【上一页标题】{deck['pages'][n - 2].get('title', '')}"]
    return "\n".join(parts)


def _image_b64(d: Path, n: int) -> str:
    return base64.standard_b64encode((d / "pages" / f"{n:03d}.jpg").read_bytes()).decode()


def _normalize(data: dict, by: str) -> dict:
    pts = []
    for it in data.get("points", []):
        if isinstance(it, str):
            pts.append(it)
        elif it.get("text"):
            pts.append(("　• " if it.get("level") == 2 else "") + it["text"].strip())
    return {
        "t": (data.get("title") or "").strip(),
        "s": (data.get("gist") or "").strip(),
        "p": pts,
        "k": [[t.get("term", ""), t.get("meaning", ""), t.get("note", "")] for t in data.get("terms", []) if t.get("term")],
        "tip": (data.get("tip") or "").strip(),
        "by": by,
        "at": time.time(),
    }


def _parse_json(text: str) -> dict:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if m:
        text = m.group(1)
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start:end + 1])


class AIError(Exception):
    pass


# ---------------------------------------------------------------- Claude
def _claude(settings, deck, d, n):
    try:
        import anthropic
    except ImportError as e:
        raise AIError("缺少 anthropic 库：pip install anthropic") from e
    client = anthropic.Anthropic(api_key=settings.get("api_key") or None,
                                 base_url=settings.get("base_url") or None)
    model = settings.get("model") or "claude-opus-5-5"
    content = []
    if settings.get("send_images", True):
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": _image_b64(d, n)}})
    content.append({"type": "text", "text": page_prompt(deck, n)})
    output_config = {"format": {"type": "json_schema", "schema": SCHEMA}}
    if settings.get("effort"):
        output_config["effort"] = settings["effort"]
    kwargs = dict(
        model=model,
        max_tokens=16000,
        # 说明 + 整份课件目录对每一页都相同，放在 system 里并打缓存断点，批量生成时更省钱
        system=[{"type": "text", "text": system_prompt(settings.get("language", "zh"))},
                {"type": "text", "text": deck_context(deck), "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": content}],
        output_config=output_config,
    )
    try:
        if model in _FALLBACK_MODELS and not settings.get("base_url"):
            resp = client.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs)
        else:
            resp = client.messages.create(**kwargs)
    except anthropic.AuthenticationError as e:
        raise AIError("API Key 无效，请在“设置”里检查") from e
    except anthropic.RateLimitError as e:
        raise AIError("请求太频繁（429），稍后重试或在设置里调低并发数") from e
    except anthropic.APIConnectionError as e:
        raise AIError("连不上 Claude API，请检查网络 / 代理") from e
    except anthropic.APIStatusError as e:
        raise AIError(f"Claude API 错误 {e.status_code}：{e.message}") from e
    if resp.stop_reason == "refusal":
        raise AIError("模型拒绝了这一页的请求")
    if resp.stop_reason == "max_tokens":
        raise AIError("输出被截断（max_tokens）")
    text = next((b.text for b in resp.content if b.type == "text"), "")
    return _normalize(json.loads(text), f"Claude · {resp.model}")


# ---------------------------------------------------------------- OpenAI 兼容
def _openai(settings, deck, d, n):
    try:
        from openai import OpenAI, APIStatusError, APIConnectionError, AuthenticationError
    except ImportError as e:
        raise AIError("缺少 openai 库：pip install openai") from e
    client = OpenAI(api_key=settings.get("api_key") or None, base_url=settings.get("base_url") or None)
    model = settings.get("model") or "gpt-5"
    sys_text = system_prompt(settings.get("language", "zh")) + "\n\n" + deck_context(deck)
    schema_hint = "\n\n输出必须是符合此 JSON Schema 的对象：\n" + json.dumps(SCHEMA, ensure_ascii=False)
    user_text = page_prompt(deck, n)

    attempts = []
    if settings.get("send_images", True):
        img = {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + _image_b64(d, n)}}
        attempts += [("schema", [img, {"type": "text", "text": user_text}]), ("json", [img, {"type": "text", "text": user_text + schema_hint}])]
    attempts += [("schema", user_text), ("json", user_text + schema_hint)]

    last = None
    for mode, content in attempts:
        fmt = ({"type": "json_schema", "json_schema": {"name": "slide_note", "schema": SCHEMA, "strict": True}}
               if mode == "schema" else {"type": "json_object"})
        try:
            r = client.chat.completions.create(
                model=model, response_format=fmt,
                messages=[{"role": "system", "content": sys_text}, {"role": "user", "content": content}],
            )
            return _normalize(_parse_json(r.choices[0].message.content or ""), f"{model}")
        except AuthenticationError as e:
            raise AIError("API Key 无效，请在“设置”里检查") from e
        except APIConnectionError as e:
            raise AIError("连不上接口，请检查网络和 Base URL") from e
        except APIStatusError as e:
            if e.status_code in (429,) or e.status_code >= 500:
                raise AIError(f"接口错误 {e.status_code}：{e.message}") from e
            last = e          # 400 一类：多半是不支持图片 / json_schema，换下一种方式
        except (ValueError, KeyError) as e:
            last = e
    raise AIError(f"接口没有返回可用的结果：{last}")


# ---------------------------------------------------------------- 本机 Claude Code（订阅账号）
CLI_LOGIN = "Claude Code 还没有登录（或登录已过期）：打开终端运行 claude，按提示用你的 Claude 账号登录后再试"
CLI_MISSING = "没有找到 Claude Code：先安装（https://claude.com/claude-code），并在终端运行一次 claude 登录"


def find_claude_cli() -> str | None:
    exe = shutil.which("claude")
    if exe:
        return exe
    home = Path.home()
    for c in (home / ".local/bin/claude.exe", home / ".local/bin/claude", home / ".claude/local/claude"):
        if c.is_file():
            return str(c)
    return None


def _cli_env() -> dict:
    # 去掉宿主（比如从另一个 Claude Code 里启动时）带进来的会话变量，也不让它误用 API Key 计费
    return {k: v for k, v in os.environ.items()
            if not (k.startswith("CLAUDE") or k in ("ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"))}


def _run_cli(args: list[str], prompt: str, timeout: int = 300) -> dict:
    exe = find_claude_cli()
    if not exe:
        raise AIError(CLI_MISSING)
    try:
        r = subprocess.run([exe, "-p", "--output-format", "json", "--no-session-persistence", *args],
                           input=prompt, capture_output=True, text=True, encoding="utf-8", errors="replace",
                           timeout=timeout, env=_cli_env(),
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except subprocess.TimeoutExpired as e:
        raise AIError("Claude Code 超时没有返回") from e
    try:
        out = json.loads(r.stdout.strip().splitlines()[-1] if r.stdout.strip() else "{}")
    except ValueError:
        out = {}
    if not out or out.get("is_error"):
        msg = str(out.get("result") or r.stderr or r.stdout or "").strip()
        if re.search(r"auth|log ?in|oauth|credential|/login", msg, re.I):
            raise AIError(CLI_LOGIN)
        if re.search(r"usage limit|rate limit|limit reached", msg, re.I):
            raise AIError("订阅额度暂时用完了，稍后再试：" + msg[:120])
        raise AIError("Claude Code 出错：" + (msg[:200] or f"退出码 {r.returncode}"))
    return out


def _claude_cli(settings, deck, d, n):
    args = ["--system-prompt", system_prompt(settings.get("language", "zh")),
            "--json-schema", json.dumps(SCHEMA, ensure_ascii=False)]
    if settings.get("cli_model"):
        args += ["--model", settings["cli_model"]]
    prompt = deck_context(deck) + "\n\n" + page_prompt(deck, n)
    if settings.get("send_images", True):
        img = (d / "pages" / f"{n:03d}.jpg").resolve()
        # 只开放只读的 Read 工具、只能读课件目录，用来看幻灯片图片
        args += ["--tools", "Read", "--allowedTools", "Read", "--permission-mode", "dontAsk", "--add-dir", str(d.resolve())]
        prompt = f"先用 Read 工具查看本页幻灯片图片：{img}\n然后写讲解卡片。\n\n" + prompt
    else:
        args += ["--tools", ""]
    out = _run_cli(args, prompt)
    data = out.get("structured_output")
    if not isinstance(data, dict):
        try:
            data = _parse_json(str(out.get("result", "")))
        except ValueError as e:
            raise AIError("Claude Code 没有返回可解析的讲解") from e
    models = list((out.get("modelUsage") or {}).keys())
    return _normalize(data, "Claude Code" + (f" · {models[-1]}" if models else ""))


# ---------------------------------------------------------------- 离线提纲
def _outline(settings, deck, d, n):
    p = deck["pages"][n - 1]
    norm = lambda t: [re.sub(r"\s+", " ", x).strip() for x in (t or "").splitlines()]
    # 出现在一半以上页面里的行（页脚、版权）不算内容
    counts = {}
    for q in deck["pages"]:
        for x in set(norm(q.get("text"))):
            counts[x] = counts.get(x, 0) + 1
    common = {x for x, c in counts.items() if len(deck["pages"]) > 2 and c > len(deck["pages"]) / 2}
    title = p.get("title") or ""
    lines = [x for x in norm(p.get("text")) if x and x not in title and x not in common
             and not x.lower().startswith("copyright") and not (x.isupper() and len(x) < 24)]
    return {
        "t": p.get("title") or f"第 {n} 页",
        "s": lines[0] if lines else "",
        "p": lines[1:12],
        "k": [],
        "tip": "这是由页面文字整理的提纲，尚未经过 AI 讲解。在“设置”里配置 AI 后可一键重新生成。",
        "by": "提纲",
        "at": time.time(),
    }


def test_connection(settings) -> str:
    """发一个极小的请求，确认 Key / 模型 / 网络都可用。"""
    engine = engine_of(settings)
    if engine == "outline":
        return "离线提纲模式不需要连接 AI"
    if engine == "web":
        return "网页版模式不需要连接：在阅读页点“AI 讲解”，按步骤复制、粘贴即可"
    if engine == "claude-cli":
        args = ["--tools", ""] + (["--model", settings["cli_model"]] if settings.get("cli_model") else [])
        out = _run_cli(args, "Reply with exactly: OK", timeout=120)
        models = list((out.get("modelUsage") or {}).keys())
        return "连接成功：Claude Code" + (f" · {models[-1]}" if models else "") + "（使用你的订阅额度）"
    if engine == "anthropic":
        try:
            import anthropic
        except ImportError as e:
            raise AIError("缺少 anthropic 库：pip install anthropic") from e
        client = anthropic.Anthropic(api_key=settings.get("api_key") or None, base_url=settings.get("base_url") or None)
        try:
            r = client.messages.create(model=settings.get("model") or "claude-opus-5-5", max_tokens=64,
                                       output_config={"effort": "low"},
                                       messages=[{"role": "user", "content": "Reply with: OK"}])
        except anthropic.AuthenticationError as e:
            raise AIError("API Key 无效") from e
        except anthropic.NotFoundError as e:
            raise AIError("找不到这个模型，请检查模型名") from e
        except anthropic.APIConnectionError as e:
            raise AIError("连不上 Claude API，请检查网络 / 代理") from e
        except anthropic.APIStatusError as e:
            raise AIError(f"Claude API 错误 {e.status_code}：{e.message}") from e
        except TypeError as e:          # 没有任何可用凭据
            raise AIError(NO_KEY) from e
        return f"连接成功：{r.model}"
    try:
        from openai import OpenAI, APIStatusError, APIConnectionError, AuthenticationError
    except ImportError as e:
        raise AIError("缺少 openai 库：pip install openai") from e
    client = OpenAI(api_key=settings.get("api_key") or None, base_url=settings.get("base_url") or None)
    try:
        r = client.chat.completions.create(model=settings.get("model") or "gpt-5",
                                           messages=[{"role": "user", "content": "Reply with: OK"}])
    except AuthenticationError as e:
        raise AIError("API Key 无效") from e
    except APIConnectionError as e:
        raise AIError("连不上接口，请检查网络和 Base URL") from e
    except APIStatusError as e:
        raise AIError(f"接口错误 {e.status_code}：{e.message}") from e
    except Exception as e:  # openai 在缺少 Key 时直接抛 OpenAIError
        raise AIError(NO_KEY if re.search(r"api[_ ]?key|auth", str(e), re.I) else str(e)) from e
    return f"连接成功：{r.model}"


def engine_of(settings) -> str:
    prov = settings.get("provider", "web")
    return prov if prov in ("anthropic", "outline", "web", "claude-cli") else "openai"


def generate_page(deck_id: str, n: int, settings: dict) -> dict:
    d = library.deck_dir(deck_id)
    deck = json.loads((d / "deck.json").read_text(encoding="utf-8"))
    if not 1 <= n <= len(deck["pages"]):
        raise AIError(f"页码 {n} 超出范围")
    engine = engine_of(settings)
    if engine == "web":
        raise AIError("当前是网页版模式：请在阅读页点“AI 讲解”，按步骤复制提示词到网页版 AI")
    fn = {"anthropic": _claude, "openai": _openai, "outline": _outline, "claude-cli": _claude_cli}[engine]
    try:
        return fn(settings, deck, d, n)
    except AIError:
        raise
    except Exception as e:
        if re.search(r"api[_ ]?key|auth|credential", str(e), re.I):
            raise AIError(NO_KEY) from e
        raise


NO_KEY = "还没有配置 API Key：请在“AI 设置”里填写，或改用“离线提纲”"
FATAL = {NO_KEY, CLI_LOGIN, CLI_MISSING}


# ---------------------------------------------------------------- 通用文本任务（出题、提取生词）
def complete_text(settings: dict, prompt: str, timeout: int = 900) -> str:
    """把一整段提示词发给当前引擎，返回模型的原始文本回复（由调用方解析 JSON）。"""
    engine = engine_of(settings)
    if engine in ("web", "outline"):
        raise AIError("当前模式不能自动调用 AI：请用“复制提示词 → 粘贴回复”，或在 AI 设置里换成 Claude Code / API Key")
    if engine == "claude-cli":
        args = ["--tools", ""] + (["--model", settings["cli_model"]] if settings.get("cli_model") else [])
        return str(_run_cli(args, prompt, timeout=timeout).get("result") or "")
    if engine == "anthropic":
        try:
            import anthropic
        except ImportError as e:
            raise AIError("缺少 anthropic 库：pip install anthropic") from e
        client = anthropic.Anthropic(api_key=settings.get("api_key") or None, base_url=settings.get("base_url") or None)
        try:
            # 题库可能很长，用流式避免长请求超时
            with client.messages.stream(model=settings.get("model") or "claude-opus-5-5", max_tokens=32000,
                                        messages=[{"role": "user", "content": prompt}]) as stream:
                msg = stream.get_final_message()
        except anthropic.AuthenticationError as e:
            raise AIError("API Key 无效，请在“设置”里检查") from e
        except anthropic.APIConnectionError as e:
            raise AIError("连不上 Claude API，请检查网络 / 代理") from e
        except anthropic.APIStatusError as e:
            raise AIError(f"Claude API 错误 {e.status_code}：{e.message}") from e
        except TypeError as e:
            raise AIError(NO_KEY) from e
        if msg.stop_reason == "refusal":
            raise AIError("模型拒绝了这个请求")
        return "".join(b.text for b in msg.content if b.type == "text")
    try:
        from openai import OpenAI, APIStatusError, APIConnectionError, AuthenticationError
    except ImportError as e:
        raise AIError("缺少 openai 库：pip install openai") from e
    client = OpenAI(api_key=settings.get("api_key") or None, base_url=settings.get("base_url") or None, timeout=timeout)
    try:
        r = client.chat.completions.create(model=settings.get("model") or "gpt-5", messages=[{"role": "user", "content": prompt}])
    except AuthenticationError as e:
        raise AIError("API Key 无效，请在“设置”里检查") from e
    except APIConnectionError as e:
        raise AIError("连不上接口，请检查网络和 Base URL") from e
    except APIStatusError as e:
        raise AIError(f"接口错误 {e.status_code}：{e.message}") from e
    except Exception as e:  # noqa: BLE001  openai 缺 Key 时抛 OpenAIError
        raise AIError(NO_KEY if re.search(r"api[_ ]?key|auth", str(e), re.I) else str(e)) from e
    return r.choices[0].message.content or ""
