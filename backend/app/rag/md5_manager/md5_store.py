import json
import os
import threading
from datetime import datetime

import aiofiles
from aiofiles import os as aio_os

from app.core.logger_handler import logger
from app.utils.config import chroma_config
from app.utils.path_tool import get_abstract_path


class MD5Store:
    """MD5存储管理器（带内存索引缓存）

    文件是唯一持久化事实（每行一条 JSON 记录），内存缓存只做读加速：
    查重/列表从"逐行扫描文件 O(n)"降为内存查询；写路径（保存/删除）同步更新缓存。
    缓存按 user 维度惰性加载，删除用户记录时一并清除。
    """

    def __init__(self):
        self.base_dir = os.path.dirname(get_abstract_path(chroma_config['md5_hex_store']))
        # 内存索引：user_key -> 记录列表（None 表示尚未加载）
        self._cache: dict[str, list | None] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _cache_key(user_id: str = None) -> str:
        return user_id or "__public__"

    def _get_md5_store_dir(self, user_id: str = None) -> str:
        """
        获取MD5存储目录
        :param user_id: 用户ID，为None时返回公共目录
        :return: MD5存储目录路径
        """
        if user_id:
            return os.path.join(self.base_dir, 'user_md5', user_id)
        else:
            return os.path.join(self.base_dir, 'public_md5')

    # ------------------------------------------------------------------
    # 缓存层（同步，供 async/sync 两侧复用）
    # ------------------------------------------------------------------
    def _load_records_sync(self, user_id: str = None) -> list:
        """从文件同步加载记录（文件不存在返回空列表）"""
        md5_path = os.path.join(self._get_md5_store_dir(user_id), 'md5_hex_store.txt')
        if not os.path.exists(md5_path):
            return []

        records = []
        with open(md5_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                if line.startswith('{'):
                    try:
                        records.append(json.loads(line))
                    except json.JSONDecodeError:
                        records.append({
                            'md5': line, 'filename': None,
                            'original_filename': None, 'upload_time': None
                        })
                else:
                    records.append({
                        'md5': line, 'filename': None,
                        'original_filename': None, 'upload_time': None
                    })
        return records

    def _get_cached_records(self, user_id: str = None) -> list:
        """获取缓存记录（未加载则从文件加载并缓存）"""
        key = self._cache_key(user_id)
        with self._lock:
            records = self._cache.get(key)
            if records is None:
                records = self._load_records_sync(user_id)
                self._cache[key] = records
            return records

    def _set_cached_records(self, user_id: str = None, records: list = None):
        """直接覆盖缓存记录"""
        with self._lock:
            self._cache[self._cache_key(user_id)] = records or []

    def _invalidate_cache(self, user_id: str = None):
        """清除指定用户的缓存（删除用户记录时调用）"""
        with self._lock:
            self._cache.pop(self._cache_key(user_id), None)

    # ------------------------------------------------------------------
    # 公开 API
    # ------------------------------------------------------------------
    async def check_md5_hex(self, md5_for_check: str, user_id: str = None) -> bool:
        """
        异步检查md5（内存索引，O(1) 均摊）
        :param md5_for_check: 要检查的MD5值
        :param user_id: 用户ID，为None时检查公共知识库
        :return: 是否存在
        """
        try:
            import asyncio
            records = await asyncio.to_thread(self._get_cached_records, user_id)
            return any(r.get('md5') == md5_for_check for r in records)
        except Exception as e:
            logger.error(f"【向量数据库】检查MD5时出错: {e}")
            return False

    async def save_md5_hex(self, md5_hex: str, filename: str = None, original_filename: str = None, user_id: str = None):
        """
        异步保存md5（追加写入文件并更新内存缓存）
        :param md5_hex: 要保存的MD5值
        :param filename: 文件名（可选）
        :param original_filename: 原始文件名（可选）
        :param user_id: 用户ID，为None时保存到公共知识库
        """
        import asyncio
        md5_dir = self._get_md5_store_dir(user_id)
        md5_path = os.path.join(md5_dir, 'md5_hex_store.txt')

        if not await aio_os.path.exists(md5_dir):
            await aio_os.makedirs(md5_dir, exist_ok=True)

        data = {
            'md5': md5_hex,
            'filename': filename,
            'original_filename': original_filename,
            'upload_time': datetime.now().isoformat()
        }

        async with aiofiles.open(md5_path, 'a', encoding="utf-8") as f:
            await f.write(json.dumps(data, ensure_ascii=False) + '\n')

        # 更新内存缓存（先确保已加载，再追加）
        await asyncio.to_thread(self._append_cache, user_id, data)

    def save_md5_hex_sync(self, md5_hex: str, filename: str = None, original_filename: str = None, user_id: str = None):
        """
        同步保存md5（用于多线程场景；写文件并更新内存缓存）
        :param md5_hex: 要保存的MD5值
        :param filename: 文件名（可选）
        :param original_filename: 原始文件名（可选）
        :param user_id: 用户ID，为None时保存到公共知识库
        """
        md5_dir = self._get_md5_store_dir(user_id)
        md5_path = os.path.join(md5_dir, 'md5_hex_store.txt')

        if not os.path.exists(md5_dir):
            os.makedirs(md5_dir, exist_ok=True)

        data = {
            'md5': md5_hex,
            'filename': filename,
            'original_filename': original_filename,
            'upload_time': datetime.now().isoformat()
        }

        with open(md5_path, 'a', encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False) + '\n')

        self._append_cache(user_id, data)

    def _append_cache(self, user_id: str = None, data: dict = None):
        """追加一条记录到缓存（线程安全）"""
        with self._lock:
            records = self._cache.get(self._cache_key(user_id))
            if records is None:
                records = self._load_records_sync(user_id)
            records.append(data)
            self._cache[self._cache_key(user_id)] = records

    async def _read_md5_records(self, user_id: str = None) -> tuple:
        """
        读取用户的MD5记录文件（保留原接口，改用缓存）
        :param user_id: 用户ID，为None时读取公共知识库
        :return: (file_path, records列表)，每条记录为dict
        """
        import asyncio
        md5_path = os.path.join(self._get_md5_store_dir(user_id), 'md5_hex_store.txt')
        records = await asyncio.to_thread(self._get_cached_records, user_id)
        return md5_path, records

    async def _write_md5_records(self, md5_path: str, records: list):
        """
        写入MD5记录文件，空列表时自动清理文件及目录
        :param md5_path: 文件路径
        :param records: 记录列表
        """
        if not records:
            md5_dir = os.path.dirname(md5_path)
            if await aio_os.path.exists(md5_path):
                await aio_os.remove(md5_path)
            if await aio_os.path.exists(md5_dir):
                try:
                    await aio_os.rmdir(md5_dir)
                except OSError:
                    pass
            return

        async with aiofiles.open(md5_path, 'w', encoding="utf-8") as f:
            for record in records:
                await f.write(json.dumps(record, ensure_ascii=False) + '\n')

    async def delete_user_md5(self, user_id: str):
        """
        删除用户的整个MD5记录目录（同时清除内存缓存）
        :param user_id: 用户ID
        """
        md5_dir = self._get_md5_store_dir(user_id)
        md5_path = os.path.join(md5_dir, 'md5_hex_store.txt')
        if await aio_os.path.exists(md5_path):
            await aio_os.remove(md5_path)
        if await aio_os.path.exists(md5_dir):
            await aio_os.rmdir(md5_dir)
        self._invalidate_cache(user_id)
        logger.info(f"【MD5存储】已删除用户 {user_id} 的MD5记录")

    async def delete_by_filename(self, user_id: str, filename: str):
        """
        通过文件名删除MD5记录（更新缓存）
        :param user_id: 用户ID
        :param filename: 文件名
        :return: 被删记录的md5值，不存在返回None
        """
        import asyncio
        md5_path, records = await self._read_md5_records(user_id)
        if not records:
            return None

        found_md5 = None
        remaining = []
        for record in records:
            record_filename = record.get('filename', record.get('original_filename'))
            if record_filename == filename:
                found_md5 = record.get('md5')
            else:
                remaining.append(record)

        if found_md5 is None:
            return None

        await self._write_md5_records(md5_path, remaining)
        self._set_cached_records(user_id, remaining)
        logger.info(f"【MD5存储】已删除用户 {user_id} 的文件 {filename} 的MD5记录")
        return found_md5

    async def delete_single_md5(self, user_id: str, md5_to_delete: str) -> bool:
        """
        删除单个MD5记录（更新缓存）
        :param user_id: 用户ID
        :param md5_to_delete: 要删除的MD5值
        :return: 是否成功删除
        """
        import asyncio
        md5_path, records = await self._read_md5_records(user_id)
        if not records:
            return False

        remaining = [r for r in records if r.get('md5') != md5_to_delete]
        if len(remaining) == len(records):
            return False

        await self._write_md5_records(md5_path, remaining)
        self._set_cached_records(user_id, remaining)
        logger.info(f"【MD5存储】已删除用户 {user_id} 的MD5记录: {md5_to_delete}")
        return True

    async def get_md5_info(self, user_id: str, md5_value: str):
        """
        获取MD5对应的文档信息（内存查询）
        :param user_id: 用户ID
        :param md5_value: MD5值
        :return: MD5信息字典，不存在返回None
        """
        _, records = await self._read_md5_records(user_id)
        for record in records:
            if record.get('md5') == md5_value:
                return record
        return None

    async def get_all_md5_records(self, user_id: str) -> list:
        """
        获取用户的所有MD5记录（内存查询）
        :param user_id: 用户ID
        :return: MD5记录列表
        """
        _, records = await self._read_md5_records(user_id)
        return records
