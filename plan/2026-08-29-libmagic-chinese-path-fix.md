# libmagic 中文路径问题排查记录

> 日期：2026-08-29
> 状态：已修复（`257460f` + `fe60856` + `865701f`）
> 影响面：知识库文件上传的文件类型（MIME）检测

---

## 一、问题现象

1. 知识库上传文件时接口 500，后端日志：
   ```
   magic.magic.MagicException: b'could not find any valid magic files!'
   ```
2. 无论上传什么文件都报错，上传功能完全不可用。

## 二、排查过程

### 第 1 层：环境缺 libmagic 数据库？
- `magic.Magic(mime=True)` 初始化抛 `MagicException`
- 结论：**不完全是**——`magic/libmagic/magic.mgc`（4.9MB）和 `libmagic.dll` 都存在，但加载失败

### 第 2 层：包冲突（真实根因之一）
- 环境里**同时存在** `python-magic==0.4.27`（`unstructured` 的传递依赖）与 `python-magic-bin==0.4.14`（用户后装）
- 两个包都提供 `magic` 模块，**文件互相覆盖**，卸载其中一个会破坏另一个的文件
- **处理**：pyproject 用 `[tool.uv] override-dependencies` 把 `python-magic` 限制到 `sys_platform == 'linux'`，Windows 只保留 `python-magic-bin`（`865701f`）
- ⚠️ 卸载 python-magic 时**误删了共用的 `magic/__init__.py` 等文件** → 重装 python-magic-bin 恢复（需先停 8000，DLL 被占用无法替换）

### 第 3 层：ctypes 诊断
- 直接 `ctypes.CDLL('magic/libmagic/libmagic.dll')` → 加载成功
- `magic_open` → cookie 正常（64 位指针）
- `magic_load(cookie, mgc路径)` → 返回 -1，错误 `could not find any valid magic files`
- DLL 版本 `magic_version() = 532`（file 5.32，与 mgc 新格式 `1c 04 1e f1` 配套）

### 第 4 层：中文路径（最终根因）
- **项目位于 `D:\项目\RAGNotebook-master`（含中文）**
- Windows 上 libmagic 的 `fopen` 用 **ANSI（GBK）编码**解释路径
- 传入 UTF-8 编码的中文路径 → 路径乱码 → 打不开 `magic.mgc`
- **验证**：把 `magic.mgc` 复制到纯英文路径（`%TEMP%`）后 `magic_load` 立即成功，检测出 `application/pdf`

## 三、根因总结

| # | 根因 | 影响 |
| --- | --- | --- |
| 1 | 项目路径含中文，libmagic 的 fopen 用 ANSI 解释 UTF-8 路径 | **打不开 magic 数据库**（最终根因） |
| 2 | python-magic 与 python-magic-bin 包冲突（文件互相覆盖） | 环境混乱、卸载互相破坏 |

## 四、修复方案

### 代码修复（`fe60856` 初版 + `257460f` 最终）
`backend/app/router/knowledge_service.py` 的 `_get_magic_mime()`：

1. **失败标记**：初始化失败记 `False`，避免每次请求重复尝试（原实现每次上传都 500）
2. **中文路径降级**（`_init_magic_with_ascii_path`）：失败后把 `magic.mgc` 复制到纯英文系统临时目录（`%TEMP%\cloud-notebook-magic.mgc`），用 `magic.Magic(mime=True, magic_file=临时路径)` 重新初始化
3. **最终兜底**：仍失败 → 上传校验降级为**仅按扩展名白名单**（`.pdf/.txt/.md/.pptx/.docx`），功能不中断

### 依赖修复（`865701f`）
`backend/pyproject.toml`：
```toml
[tool.uv]
override-dependencies = ["python-magic==0.4.27; sys_platform == 'linux'"]
```
- 移除重复的 `python-magic-bin` 依赖行
- Windows/macOS 只用 `python-magic-bin`（自带二进制）；Linux 用 `python-magic`（需系统 libmagic）

## 五、验证结果

| 验证项 | 结果 |
| --- | --- |
| `_get_magic_mime()` 初始化 | ✅ 返回可用实例 |
| txt 内容检测 | ✅ `text/plain` |
| pdf 内容检测 | ✅ `application/pdf` |
| 上传 SSE 全流程 | ✅ completed + finish，success_count=1 |
| 降级路径（magic 不可用） | ✅ 扩展名校验，上传正常（`fe60856` 实测） |

## 六、踩坑备忘（写给未来的自己/下一个 Agent）

1. **本项目路径含中文**：任何用 C 库做文件操作的依赖（libmagic 等）都可能遇到路径编码问题。修复思路 = 复制资源到英文临时路径。
2. **python-magic 与 python-magic-bin 不能共存**：都提供 `magic` 模块。判断当前版本：`magic.__file__` + 看 `magic/libmagic/` 目录是否作为 DLL 查找源。
3. **卸载共享文件包会互相破坏**：重装被占用 DLL 需先停 uvicorn 进程（Windows 文件锁）。
4. **Windows 上 magic 排障顺序**：`import magic` → `magic.Magic(mime=True)` → 不行则 `ctypes` 直调 `magic_load` 看错误 → 不行则怀疑路径编码（复制 mgc 到英文路径验证）。
5. **沙箱限制**：pytest/vite 沙箱跑不了，PyPI 下载在沙箱内走代理会 IDNA 报错（需 `ProxyHandler({})` 或本机操作）。
