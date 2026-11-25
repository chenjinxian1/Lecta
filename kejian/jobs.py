"""后台任务：导入课件、批量生成讲解。前端轮询 /api/jobs/<id> 获取进度。"""
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import ai, config, importer, library

JOBS: dict[str, dict] = {}
_lock = threading.Lock()


def _new(kind: str, **extra) -> dict:
    job = {"id": uuid.uuid4().hex[:10], "kind": kind, "status": "running", "done": 0, "total": 0,
           "message": "", "errors": [], "result": None, "started": time.time(), "cancel": False, **extra}
    with _lock:
        JOBS[job["id"]] = job
        # 只保留最近 50 个任务
        for old in sorted(JOBS.values(), key=lambda j: j["started"])[:-50]:
            JOBS.pop(old["id"], None)
    return job


def public(job: dict) -> dict:
    return {k: v for k, v in job.items() if k != "cancel"}


def get(job_id: str) -> dict | None:
    return JOBS.get(job_id)


def cancel(job_id: str):
    if job_id in JOBS:
        JOBS[job_id]["cancel"] = True


def active_for(deck_id: str) -> list[dict]:
    return [public(j) for j in JOBS.values() if j.get("deck") == deck_id and j["status"] == "running"]


def start_import(path, original_name: str, title: str | None = None, cleanup=True) -> dict:
    job = _new("import", name=original_name)

    def progress(done, total, msg):
        job.update(done=done, total=total, message=msg)

    def run():
        try:
            job["result"] = importer.import_file(path, title=title, progress=progress, original_name=original_name)
            job["status"] = "done"
        except importer.ImportError_ as e:
            job.update(status="error", message=str(e))
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            job.update(status="error", message=f"导入失败：{e}")
        finally:
            if cleanup:
                try:
                    path.unlink()
                except OSError:
                    pass

    threading.Thread(target=run, daemon=True).start()
    return job


def start_generate(deck_id: str, pages: list[int], overwrite: bool = False) -> dict:
    settings = config.load_settings()
    d = library.deck_dir(deck_id)
    if library.is_readonly(d):
        raise PermissionError("示例课件是只读的")
    if ai.engine_of(settings) == "web":
        raise ValueError("当前是网页版模式，请用“复制提示词 → 粘贴回复”的方式生成")
    existing = library.load_notes(d)
    todo = [n for n in pages if overwrite or not existing.get(str(n))]
    job = _new("generate", deck=deck_id, pages=todo, finished=[])
    job.update(total=len(todo), message="排队中…" if todo else "这些页面都已经有讲解了")

    def one(n):
        if job["cancel"]:
            return n, None
        note = ai.generate_page(deck_id, n, settings)
        library.save_note(deck_id, n, note)
        return n, note

    def run():
        if not todo:
            job["status"] = "done"
            return
        engine = ai.engine_of(settings)
        cap = 2 if engine == "claude-cli" else 8          # 订阅账号别并发太多
        workers = 1 if engine == "outline" else max(1, min(cap, int(settings.get("concurrency", 3))))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = {pool.submit(one, n): n for n in todo}
            for f in as_completed(futs):
                n = futs[f]
                try:
                    f.result()
                    job["finished"].append(n)
                except ai.AIError as e:
                    job["errors"].append({"page": n, "error": str(e)})
                    if str(e) in ai.FATAL:               # 没 Key / 没登录：后面的页面也不用试了
                        job["cancel"] = job["fatal"] = True
                except Exception as e:  # noqa: BLE001
                    traceback.print_exc()
                    job["errors"].append({"page": n, "error": f"{type(e).__name__}: {e}"})
                job["done"] += 1
                job["message"] = f"已完成 {job['done']} / {job['total']} 页"
        if job.get("fatal"):
            job.update(status="error", message=job["errors"][0]["error"])
        elif job["cancel"]:
            job.update(status="cancelled", message="已取消")
        elif job["errors"] and not job["finished"]:
            job.update(status="error", message=job["errors"][0]["error"])
        else:
            job["status"] = "done"

    threading.Thread(target=run, daemon=True).start()
    return job


def start_task(kind: str, prompt: str, save, label: str = "") -> dict:
    """一次性的 AI 任务（出题、提取生词）：发整段提示词，用 save(回复) 保存。"""
    settings = config.load_settings()
    if ai.engine_of(settings) in ("web", "outline"):
        raise ValueError("当前是网页版模式，请用“复制提示词 → 粘贴回复”的方式")
    job = _new(kind, total=1, message=label or "AI 正在写…")

    def run():
        try:
            job["result"] = save(ai.complete_text(settings, prompt))
            job.update(status="done", done=1, message="完成")
        except (ai.AIError, ValueError) as e:
            job.update(status="error", message=str(e))
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            job.update(status="error", message=f"{type(e).__name__}: {e}")

    threading.Thread(target=run, daemon=True).start()
    return job
