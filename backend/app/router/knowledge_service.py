import asyncio
import base64
import ipaddress
import os
import re
import socket
import tempfile
import time
from collections.abc import AsyncGenerator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import urlparse

import magic
import requests
from bs4 import BeautifulSoup
from fastapi import HTTPException, UploadFile

from app.core.logger_handler import logger
from app.rag.sse_models import SliceResult, SSEEvent
from app.rag.task_queue import TaskQueue
from app.rag.vector_store import VectorStoreService
from app.utils.file_handler import get_file_md5_hex_sync

ALLOWED_EXTENSIONS = {'.pdf', '.txt', '.md', '.pptx', '.docx'}
ALLOWED_MIME_TYPES = {
    'application/pdf', 'text/plain', 'text/markdown',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}
MAX_FILE_SIZE = 20 * 1024 * 1024
MAX_FOLDER_SIZE = 200 * 1024 * 1024

# ── 网页剪藏（M3b）──
CLIP_TIMEOUT = (5, 10)  # (连接超时, 读取超时)
CLIP_MAX_SIZE = 5 * 1024 * 1024
CLIP_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

# libmagic 实例化开销较大（加载 magic 数据库），模块级缓存单例复用
# Windows 上缺少 magic 数据库文件时初始化会抛异常：标记 False 后降级为扩展名校验，
# 避免每次上传都尝试初始化并导致 500。
_magic_mime = None


def _init_magic_with_ascii_path():
    """
    libmagic 的 fopen 在 Windows 上用 ANSI 编码解释路径，
    项目路径含中文（如 D:\\项目\\...）时打不开 magic.mgc。
    将数据库复制到纯英文系统临时目录后重新初始化。
    """
    import shutil
    import tempfile
    try:
        mgc = os.path.join(os.path.dirname(magic.__file__), 'libmagic', 'magic.mgc')
        if not os.path.exists(mgc):
            return None
        dst = os.path.join(tempfile.gettempdir(), 'cloud-notebook-magic.mgc')
        if not os.path.exists(dst):
            shutil.copyfile(mgc, dst)
        return magic.Magic(mime=True, magic_file=dst)
    except Exception as e:
        logger.warning(f"libmagic 中文路径降级初始化失败: {type(e).__name__}: {e}")
        return None


def _get_magic_mime():
    """获取 libmagic 实例；不可用时返回 None（调用方降级为扩展名校验）。"""
    global _magic_mime
    if _magic_mime is None:
        try:
            _magic_mime = magic.Magic(mime=True)
        except Exception as e:
            # 常见原因：中文/非 ASCII 项目路径导致 fopen 失败；复制 mgc 到英文路径重试
            _magic_mime = _init_magic_with_ascii_path() or False
            if not _magic_mime:
                logger.warning(f"libmagic 初始化失败，MIME 内容检测降级为扩展名校验: {type(e).__name__}: {e}")
    return _magic_mime if _magic_mime else None


def _is_private_ip(ip: str) -> bool:
    """判断 IP 是否属于内网/保留段（防 SSRF），兼容 IPv4/IPv6。"""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def _validate_clip_url(url: str) -> str:
    """校验剪藏 URL：仅 http/https + 域名解析后拒绝内网地址（防 SSRF）。"""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="仅支持 http/https 链接")
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="URL 无效")
    if host == "localhost" or host.endswith(".local") or host.endswith(".localhost"):
        raise HTTPException(status_code=400, detail="不允许剪藏本地地址")
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        raise HTTPException(status_code=400, detail="域名无法解析")
    for info in infos:
        if _is_private_ip(info[4][0]):
            raise HTTPException(status_code=400, detail="不允许剪藏内网地址")
    return url


def _fetch_clip_content(url: str) -> bytes:
    """同步抓取 URL 内容（在 to_thread 中执行），带超时与大小限制。"""
    resp = requests.get(
        url, timeout=CLIP_TIMEOUT,
        headers={"User-Agent": CLIP_USER_AGENT},
        stream=True,
    )
    resp.raise_for_status()
    size = 0
    chunks = []
    for chunk in resp.iter_content(chunk_size=64 * 1024):
        chunks.append(chunk)
        size += len(chunk)
        if size > CLIP_MAX_SIZE:
            raise HTTPException(status_code=400, detail="页面内容超过 5MB 限制")
    return b"".join(chunks)


def _extract_article_markdown(html: str) -> tuple[str, str]:
    """
    BeautifulSoup 启发式正文提取 → 简单 Markdown（# 标题 + 段落 + 列表）。
    优先 <article> → <main> → <body>；剔除 script/style/nav/footer 等噪音。
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "aside", "form", "iframe", "noscript"]):
        tag.decompose()

    title = ""
    h1 = soup.find("h1")
    if h1:
        title = h1.get_text(strip=True)
    if not title and soup.title:
        title = soup.title.get_text(strip=True)

    article = soup.find("article") or soup.find("main") or soup.body or soup
    lines = []
    seen = set()
    for el in article.find_all(["h1", "h2", "h3", "h4", "p", "li"]):
        text = el.get_text(separator=" ", strip=True)
        if not text or len(text) < 2 or text in seen:
            continue
        seen.add(text)
        if el.name in ("h1", "h2", "h3", "h4"):
            lines.append(f"{'#' * int(el.name[1])} {text}")
        elif el.name == "li":
            lines.append(f"- {text}")
        else:
            lines.append(text)
    return title, "\n\n".join(lines)


@dataclass
class ProcessingState:
    total_files: int = 0
    total_valid: int = 0
    sliced_count: int = 0
    written_count: int = 0
    success_count: int = 0
    failed_count: int = 0
    slice_success_count: int = 0

    def current_progress(self) -> int:
        if self.total_valid == 0:
            return 0
        slice_progress = (self.sliced_count / self.total_valid) * 60
        write_progress = (self.written_count / self.total_valid) * 40
        return int(min(99, slice_progress + write_progress))


def _sync_slice_file(file_content: bytes, filename: str, file_index: int, user_id: str, queue: TaskQueue):
    """在 ThreadPoolExecutor 中执行的同步切片函数"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as temp_file:
            temp_file.write(file_content)
            temp_file_path = temp_file.name

        try:
            # 在加载文档之前计算 md5，因为多模态PDF加载器需要 md5 来确定图片的存储路径。
            # 如果后移（等切片完再算），多模态加载器就无法将图片保存到正确的位置。
            md5_hex = get_file_md5_hex_sync(temp_file_path)
            store = VectorStoreService()
            documents = store.get_file_document_sync(temp_file_path, md5=md5_hex, user_id=user_id)
            if not documents:
                queue.put(SliceResult.error_result(file_index=file_index, filename=filename, error="文件加载为空"))
                return

            split_docs = store.split_documents_sync(documents)
            if not split_docs:
                queue.put(SliceResult.error_result(file_index=file_index, filename=filename, error="切片结果为空"))
                return

            for doc in split_docs:
                doc.metadata['user_id'] = user_id
                doc.metadata['original_filename'] = filename
                doc.metadata['md5'] = md5_hex

            queue.put(SliceResult.success_result(
                file_index=file_index, filename=filename, documents=split_docs, md5=md5_hex
            ))
        finally:
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
    except Exception as e:
        logger.error(f"【SSE上传】切片文件 {filename} 时出错: {e}")
        queue.put(SliceResult.error_result(file_index=file_index, filename=filename, error=str(e)))


class KnowledgeService:
    """知识库管理服务"""

    async def handle_add_vector_single(self, file: UploadFile, user_id: str) -> str:
        """处理添加单个向量逻辑"""
        store = VectorStoreService()
        if file.size > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="文件大小不能超过20MB")

        content = await file.read()
        await file.seek(0)

        file_type = _get_magic_mime().from_buffer(content)

        file_extension = os.path.splitext(file.filename)[1].lower()

        if file_type not in ALLOWED_MIME_TYPES and file_extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"文件类型不支持，目前支持PDF、TXT、Markdown、PPTX、DOCX文件类型。检测到的文件类型: {file_type}，扩展名: {file_extension}"
            )

        await store.get_document(files=[file], user_id=user_id)
        return file.filename

    async def handle_clip(self, url: str, user_id: str) -> dict:
        """
        网页剪藏：抓取 URL → 提取正文（BeautifulSoup 启发式）→ 走切片/向量化管线入库。

        安全：仅 http/https + 域名解析后拒绝内网地址（防 SSRF）+ 超时 + 大小限制。
        复用与文件上传完全相同的 `_sync_slice_file` 流程：
        临时文件 → get_file_document_sync → split_documents_sync → add_documents + save_md5_hex。
        """
        url = _validate_clip_url(url)
        host = urlparse(url).hostname or "web"

        try:
            content = await asyncio.to_thread(_fetch_clip_content, url)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"【剪藏】抓取 {url} 失败: {e}")
            raise HTTPException(status_code=400, detail=f"抓取失败: {e}")

        html = content.decode("utf-8", errors="ignore")
        title, body = _extract_article_markdown(html)
        if not body.strip():
            raise HTTPException(status_code=400, detail="未能从页面提取到正文内容")

        safe_title = re.sub(r'[\\/:*?"<>|]', "_", title).strip()[:40] or host
        filename = f"剪藏-{safe_title}-{datetime.now().strftime('%Y%m%d')}.md"
        file_bytes = (f"# {title or safe_title}\n\n{body}").encode("utf-8")

        # 复用切片管线（线程池中执行）
        queue = TaskQueue()
        await asyncio.to_thread(_sync_slice_file, file_bytes, filename, 0, user_id, queue)
        try:
            result = await asyncio.to_thread(queue.get, True, 60)
        except Exception:
            raise HTTPException(status_code=500, detail="剪藏内容处理超时")
        if not result.success:
            raise HTTPException(status_code=400, detail=f"剪藏内容处理失败: {result.error}")

        # 写入向量库 + MD5 记录
        store = VectorStoreService()
        try:
            await asyncio.to_thread(store.vectors_store.add_documents, result.documents)
            await store.save_md5_hex(result.md5, result.filename, result.filename, user_id)
        except Exception as e:
            logger.error(f"【剪藏】写入向量库失败: {e}")
            raise HTTPException(status_code=500, detail=f"写入知识库失败: {e}")

        logger.info(f"【剪藏】完成 {url} → {result.filename}（{len(result.documents)} 片）")
        return {
            "filename": result.filename,
            "chunk_count": len(result.documents),
            "title": title or safe_title,
        }

    async def handle_add_vector_multiple(self, files: list[UploadFile], user_id: str) -> list[str]:
        """处理添加多个向量逻辑"""
        total_size = 0
        for file in files:
            total_size += file.size or 0

        if total_size > MAX_FOLDER_SIZE:
            raise HTTPException(status_code=400, detail="文件总大小不能超过200MB")

        start_time = time.time()
        results = []
        for file in files:
            try:
                await self.handle_add_vector_single(file, user_id)
                results.append(file.filename)
            except Exception as e:
                logger.error(f"【添加向量】处理文件 {file.filename} 时出错: {e}")
                raise

        end_time = time.time()
        logger.info(f"【添加向量】耗时: {end_time - start_time:.2f}秒，处理文件数: {len(results)}")

        return results

    def _yield_start_event(self, total_files: int) -> str:
        """SSE 事件：开始处理，通知前端文件总数"""
        return SSEEvent(
            event_type='start', total_files=total_files, message='开始处理文件...', progress=0
        ).to_sse()

    def _yield_size_error_event(self) -> str:
        """SSE 事件：文件总大小超限错误"""
        return SSEEvent(
            event_type='error', message='文件总大小不能超过200MB',
            error_message='文件总大小不能超过200MB'
        ).to_sse()

    def _yield_validation_error_event(
        self, current_index: int, total_files: int, filename: str,
        file_type: str, file_extension: str, failed_count: int
    ) -> str:
        """SSE 事件：单个文件 MIME 类型验证失败"""
        return SSEEvent(
            event_type='error', file_index=current_index, total_files=total_files,
            filename=filename, step='validation',
            message=f'文件 {filename} 类型不支持',
            error_message=f'文件类型: {file_type}，扩展名: {file_extension}',
            progress=int(current_index / total_files * 100),
            failed_count=failed_count
        ).to_sse()

    def _yield_slicing_completed_event(self, result: SliceResult, state: ProcessingState) -> str:
        """SSE 事件：单个文件多线程切片完成，准备写入向量库"""
        return SSEEvent(
            event_type='slicing_completed', file_index=result.file_index,
            total_files=state.total_files, filename=result.filename,
            chunk_count=result.chunk_count, step='slicing',
            message=f'文件 {result.filename} 切片完成，共 {result.chunk_count} 个切片',
            progress=state.current_progress(),
            success_count=state.success_count, failed_count=state.failed_count,
            slice_success_count=state.slice_success_count
        ).to_sse()

    def _yield_writing_event(self, result: SliceResult, state: ProcessingState) -> str:
        """SSE 事件：开始将切片结果写入向量数据库"""
        return SSEEvent(
            event_type='writing', file_index=result.file_index,
            total_files=state.total_files, filename=result.filename,
            step='writing', message=f'正在写入向量 {result.filename}...',
            progress=state.current_progress(),
            success_count=state.success_count, failed_count=state.failed_count,
            slice_success_count=state.slice_success_count
        ).to_sse()

    def _yield_completed_event(self, result: SliceResult, state: ProcessingState) -> str:
        """SSE 事件：单个文件全部处理完成（切片+写入成功）"""
        return SSEEvent(
            event_type='completed', file_index=result.file_index,
            total_files=state.total_files, filename=result.filename,
            step='completed', message=f'文件 {result.filename} 处理完成',
            progress=state.current_progress(),
            success_count=state.success_count, failed_count=state.failed_count,
            slice_success_count=state.slice_success_count
        ).to_sse()

    def _yield_write_error_event(self, result: SliceResult, state: ProcessingState, error: str) -> str:
        """SSE 事件：切片结果写入向量数据库时发生异常"""
        return SSEEvent(
            event_type='error', file_index=result.file_index,
            total_files=state.total_files, filename=result.filename,
            step='writing', message=f'文件 {result.filename} 写入失败',
            error_message=error,
            progress=state.current_progress(),
            success_count=state.success_count, failed_count=state.failed_count,
            slice_success_count=state.slice_success_count
        ).to_sse()

    def _yield_slice_error_event(self, result: SliceResult, state: ProcessingState) -> str:
        """SSE 事件：单个文件切片阶段失败（文件损坏/格式不支持等）"""
        return SSEEvent(
            event_type='error', file_index=result.file_index,
            total_files=state.total_files, filename=result.filename,
            step='slicing', message=f'文件 {result.filename} 切片失败',
            error_message=result.error,
            progress=state.current_progress(),
            success_count=state.success_count, failed_count=state.failed_count,
            slice_success_count=state.slice_success_count
        ).to_sse()

    def _yield_finish_event(self, start_time: float, total_files: int, success_count: int, failed_count: int) -> str:
        """SSE 事件：所有文件处理结束，汇总统计信息"""
        total_time = round(time.time() - start_time, 2)
        return SSEEvent(
            event_type='finish', total_files=total_files,
            success_count=success_count, failed_count=failed_count,
            message=f'处理完成，耗时 {total_time} 秒', progress=100
        ).to_sse()

    async def _validate_and_read_files(
        self, files: list[UploadFile]
    ) -> tuple[list[dict], list[str], int]:
        """
        阶段1: 读取文件内容并验证总大小
        阶段2: 逐一验证文件 MIME 类型
        返回 (有效文件列表, SSE错误事件列表, 总文件数)
        """
        total_files = len(files)
        total_size = 0
        files_content = []
        error_events: list[str] = []

        for file in files:
            content = await file.read()
            files_content.append({'file': file, 'content': content})
            total_size += len(content)
            await file.seek(0)

        if total_size > MAX_FOLDER_SIZE:
            logger.error(f"【SSE上传】文件总大小超过限制，总大小: {total_size / (1024 * 1024):.2f}MB，限制: 200MB")
            return [], [self._yield_size_error_event()], total_files

        mime = _get_magic_mime()
        valid_files = []
        current_index = 1
        failed_count = 0

        for file_info in files_content:
            file = file_info['file']
            content = file_info['content']
            file_extension = os.path.splitext(file.filename)[1].lower()

            file_type = ""
            if mime is not None:
                try:
                    file_type = mime.from_buffer(content)
                except Exception as e:
                    logger.warning(f"MIME 检测失败（按扩展名校验）: {file.filename}: {type(e).__name__}")

            if file_type not in ALLOWED_MIME_TYPES and file_extension not in ALLOWED_EXTENSIONS:
                failed_count += 1
                error_events.append(self._yield_validation_error_event(
                    current_index, total_files, file.filename,
                    file_type, file_extension, failed_count
                ))
                logger.warning(f"【SSE上传】文件类型验证失败: {file.filename}，检测到类型: {file_type}，扩展名: {file_extension}")
            else:
                valid_files.append({
                    'content': content,
                    'filename': file.filename,
                    'file_index': current_index
                })
                logger.debug(f"【SSE上传】文件类型验证通过: {file.filename}")
            current_index += 1

        return valid_files, error_events, total_files

    def _start_slicing(
        self, valid_files: list[dict], user_id: str
    ) -> tuple[TaskQueue, ThreadPoolExecutor, list]:
        """启动多线程切片，返回 (队列, 执行器, future列表)"""
        queue = TaskQueue(maxsize=10)
        queue.set_total_count(len(valid_files))

        slice_tasks = [
            (info['content'], info['filename'], info['file_index'], user_id)
            for info in valid_files
        ]

        max_workers = min(len(slice_tasks), max(1, os.cpu_count() or 1))
        logger.info(f"【SSE上传】切片阶段使用 {max_workers} 个线程")

        executor = ThreadPoolExecutor(max_workers=max_workers)
        futures = [executor.submit(_sync_slice_file, *args, queue) for args in slice_tasks]

        return queue, executor, futures

    async def _process_slice_results(
        self, queue: TaskQueue, valid_count: int, store: VectorStoreService,
        state: ProcessingState, user_id: str
    ) -> AsyncGenerator[str, None]:
        """消费切片队列 → 写入向量库 → yield SSE 进度事件"""
        while state.written_count < valid_count:
            try:
                result = queue.get(block=True, timeout=0.1)

                state.sliced_count += 1

                if result.success:
                    state.slice_success_count += 1

                    yield self._yield_slicing_completed_event(result, state)

                    try:
                        yield self._yield_writing_event(result, state)

                        await asyncio.to_thread(store.vectors_store.add_documents, result.documents)
                        await store.save_md5_hex(result.md5, result.filename, result.filename, user_id)

                        state.success_count += 1
                        state.written_count += 1

                        yield self._yield_completed_event(result, state)
                        logger.info(f"【SSE上传】文件 {result.filename} 写入完成")

                    except Exception as e:
                        state.written_count += 1
                        state.failed_count += 1
                        logger.error(f"【SSE上传】写入文件 {result.filename} 时出错: {e}")
                        yield self._yield_write_error_event(result, state, str(e))

                else:
                    state.written_count += 1
                    state.failed_count += 1
                    logger.error(f"【SSE上传】切片文件 {result.filename} 失败: {result.error}")
                    yield self._yield_slice_error_event(result, state)

                queue.task_done()

            except Exception:
                continue

    async def handle_add_vector_multiple_stream(
        self,
        files: list[UploadFile],
        user_id: str
    ) -> AsyncGenerator[str, None]:
        """
        处理多个文件上传并返回流式进度（多线程切片 + 单线程串行写入）
        """
        total_files = len(files)
        logger.info(f"【SSE上传】开始处理文件上传，文件数量: {total_files}，用户ID: {user_id}")

        yield self._yield_start_event(total_files)

        # 文件验证
        valid_files, error_events, _ = await self._validate_and_read_files(files)
        for event in error_events:
            yield event

        if not valid_files:
            logger.info("【SSE上传】无有效文件可处理")
            return

        start_time = time.time()
        state = ProcessingState(
            total_files=total_files,
            total_valid=len(valid_files)
        )

        # 多线程切片
        queue, executor, _ = self._start_slicing(valid_files, user_id)

        # 串行消费 + 写入
        store = VectorStoreService()
        async for sse in self._process_slice_results(queue, len(valid_files), store, state, user_id):
            yield sse

        executor.shutdown(wait=True)

        logger.info(
            f"【SSE上传】文件处理完成，总数: {total_files}，"
            f"成功: {state.success_count}，失败: {state.failed_count}，"
            f"耗时: {round(time.time() - start_time, 2)}秒"
        )

        yield self._yield_finish_event(start_time, total_files, state.success_count, state.failed_count)

    def _calculate_progress(self, sliced_count: int, written_count: int, total: int) -> int:
        if total == 0:
            return 0
        slice_progress = (sliced_count / total) * 60
        write_progress = (written_count / total) * 40
        return int(min(99, slice_progress + write_progress))

    async def clean_user_upload(self, user_id: str) -> None:
        """处理删除用户上传的所有向量逻辑"""
        store = VectorStoreService()
        await store.delete_user_documents(user_id)

    async def handle_clear_user_md5(self, user_id: str, delete_documents: bool = True) -> None:
        store = VectorStoreService()
        await store.delete_user_md5(user_id, delete_documents)
        if delete_documents:
            logger.info(f"【知识库】清空用户 {user_id} 的MD5记录和文档")
        else:
            logger.info(f"【知识库】清空用户 {user_id} 的MD5记录（保留知识库文档）")

    async def handle_delete_single_md5(self, user_id: str, md5_value: str, delete_documents: bool = True) -> bool:
        store = VectorStoreService()
        success = await store.delete_single_md5(user_id, md5_value, delete_documents)
        if success:
            logger.info(f"【知识库】删除用户 {user_id} 的MD5记录: {md5_value}")
        else:
            logger.warning(f"【知识库】删除用户 {user_id} 的MD5记录失败: {md5_value}")
        return success

    async def handle_delete_by_filename(self, user_id: str, filename: str, delete_documents: bool = True) -> bool:
        store = VectorStoreService()
        success = await store.delete_by_filename(user_id, filename, delete_documents)
        if success:
            logger.info(f"【知识库】删除用户 {user_id} 的文件: {filename}")
        else:
            logger.warning(f"【知识库】删除用户 {user_id} 的文件失败: {filename}")
        return success

    async def handle_get_md5_info(self, user_id: str, md5_value: str):
        store = VectorStoreService()
        return await store.get_md5_info(user_id, md5_value)

    async def handle_get_all_md5_records(self, user_id: str):
        store = VectorStoreService()
        return await store.get_all_md5_records(user_id)

    async def handle_get_user_knowledge(self, user_id: str) -> list:
        store = VectorStoreService()
        documents = await store.get_user_documents(user_id)
        logger.info(f"【知识库】获取用户 {user_id} 的知识库文档，共 {len(documents)} 个文件")
        return documents

    async def handle_get_document_detail(self, user_id: str, filename: str) -> dict:
        store = VectorStoreService()
        document = await store.get_document_detail(user_id, filename)
        if not document:
            raise HTTPException(status_code=404, detail=f"文档 {filename} 不存在")
        logger.info(f"【知识库】获取文档详情: {filename}")
        return document

    async def handle_get_document_chunks(self, user_id: str, filename: str) -> dict:
        store = VectorStoreService()
        chunks = await store.get_document_chunks(user_id, filename)
        if chunks['total_chunks'] == 0:
            raise HTTPException(status_code=404, detail=f"文档 {filename} 不存在或没有切片")
        logger.info(f"【知识库】获取文档切片: {filename}，共 {chunks['total_chunks']} 个切片")
        return chunks

    async def handle_get_batch_images(self, user_id: str, md5: str) -> dict:
        """
        一次性读取某个文档的所有提取图片，以 base64 data URL 的形式返回。
        这样前端可以一次请求拿到所有图片，然后根据 chunk 中的 image_paths 按需渲染，
        避免了每个图片单独发 HTTP 请求的性能开销（尤其适合移动端或图片较多的场景）。
        """
        from app.utils.path_tool import get_data_path
        # 安全校验：md5 必须是 32 位十六进制（防路径穿越，参与目录拼接）
        import re
        if not re.fullmatch(r"[0-9a-fA-F]{32}", md5):
            raise HTTPException(status_code=400, detail="非法 md5 参数")
        image_dir = os.path.join(get_data_path(), 'extracted_images', user_id, md5)
        if not os.path.isdir(image_dir):
            logger.warning(f"【知识库】图片目录不存在: {image_dir}")
            return {"md5": md5, "images": {}}

        images = {}
        try:
            for filename in sorted(os.listdir(image_dir)):
                filepath = os.path.join(image_dir, filename)
                if not os.path.isfile(filepath):
                    continue
                _, ext = os.path.splitext(filename)
                mime_map = {
                    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.tiff': 'image/tiff', '.tif': 'image/tiff',
                    '.bmp': 'image/bmp', '.gif': 'image/gif', '.webp': 'image/webp',
                }
                mime = mime_map.get(ext.lower(), 'application/octet-stream')
                with open(filepath, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode("utf-8")
                images[filename] = f"data:{mime};base64,{b64}"
        except Exception as e:
            logger.error(f"【知识库】读取批量图片失败: {e}")
            raise HTTPException(status_code=500, detail=f"读取图片失败: {e}")

        logger.info(f"【知识库】读取批量图片: {md5}，共 {len(images)} 张")
        return {"md5": md5, "images": images}


    async def handle_export_zip(self, user_id: str) -> bytes:
        """
        知识库整体导出为 zip：对每个文档从向量切片重建文本，打包为 zip 字节。

        说明：
        - 上传的原始文件不落盘（临时文件切片后即删），只能从 Chroma 切片重建；
          重建文本与原始文件可能存在细微差异（切片重叠/解析损耗）。
        - 有 page 元数据的文档（多模态 PDF）按页号排序，其余保持入库顺序。
        - 为防止超大知识库撑爆内存，导出文本总量超限时直接拒绝并提示。
        """
        import io
        import re
        import zipfile

        documents = await self.handle_get_user_knowledge(user_id)
        if not documents:
            raise HTTPException(status_code=404, detail="知识库为空，暂无内容可导出")

        MAX_TOTAL_TEXT = 80 * 1024 * 1024  # 重建文本总量上限（约 80MB）
        used_names: dict[str, int] = {}
        manifest: list[dict] = []

        def unique_name(base: str) -> str:
            """同名文件追加序号（如 笔记.md → 笔记-2.md）"""
            if base not in used_names:
                used_names[base] = 1
                return base
            used_names[base] += 1
            stem, ext = os.path.splitext(base)
            return f"{stem}-{used_names[base]}{ext}"

        def safe_basename(filename: str) -> str:
            """去除路径分隔符与非法文件名字符，空名兜底"""
            name = os.path.basename(filename or "").strip()
            name = re.sub(r'[\\/:*?"<>|\r\n]', "_", name)
            return name or "document"

        buf = io.BytesIO()
        total_text = 0
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, doc in enumerate(documents, start=1):
                filename = doc.get("filename", "")
                detail = await self.handle_get_document_detail(user_id, filename)
                chunks = detail.get("chunks") or []

                # 有 page（多模态 PDF）按页号升序，无 page 保持入库顺序
                chunks.sort(key=lambda c: (
                    0 if c.get("page") is not None else 1,
                    c.get("page") if c.get("page") is not None else c.get("index", 0),
                ))
                text = "\n\n".join(chunk.get("content", "") for chunk in chunks).strip()
                if not text:
                    text = "（该文档无可重建的文本内容）"

                total_text += len(text)
                if total_text > MAX_TOTAL_TEXT:
                    raise HTTPException(
                        status_code=413,
                        detail="知识库过大，暂不支持整包导出（重建文本超过 80MB）",
                    )

                zip_name = unique_name(f"{i:03d}-{safe_basename(filename)}.txt")
                zf.writestr(zip_name, text)
                manifest.append({
                    "index": i,
                    "original": filename,
                    "chunk_count": doc.get("chunk_count", len(chunks)),
                    "export": zip_name,
                })

            readme_lines = [
                "# 知识库导出说明",
                "",
                f"- 导出时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
                f"- 文档数量：{len(manifest)}",
                "",
                "> 说明：本压缩包由「云舒卷 · RAG Notebook」自动导出，文档内容由向量切片重建，",
                "> 可能与原始文件存在细微差异（如排版、图片不包含在内）。",
                "",
                "## 文件清单",
                "",
                "| # | 原始文件名 | 切片数 | 导出文件名 |",
                "| --- | --- | --- | --- |",
            ]
            for row in manifest:
                readme_lines.append(f"| {row['index']} | {row['original']} | {row['chunk_count']} | {row['export']} |")
            zf.writestr("README.md", "\n".join(readme_lines))

        logger.info(f"【知识库】导出 zip 完成：用户 {user_id}，{len(manifest)} 个文档，{total_text / 1024:.1f}KB 文本")
        return buf.getvalue()


def get_knowledge_service() -> KnowledgeService:
    """获取知识库服务实例（用于依赖注入）"""
    return KnowledgeService()
