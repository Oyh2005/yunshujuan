# 小卷页宠 · 形象更换与自定义方案

> 创建日期：2026-08-26
> 状态：方案评审
> 目标：支持用户更换形象 / 自定义形象，为页宠系统扩展"个性表达"能力

---

## 1. 结论

**完全可行**，且现有架构已预留扩展点（`CloudSpirit` 组件 + `PetMood/PetLevel` 状态协议）。按投入产出比，推荐分三期落地：

| 期 | 内容 | 复杂度 | 说明 |
| --- | --- | --- | --- |
| **一期** | 内置多角色 + 颜色自定义 | 低 | 注册表架构 + 新增 1~2 个角色 + 色板 |
| **二期** | 用户上传图片/GIF 形象 | 中 | 贴纸模式，自由度最大 |
| **三期** | Live2D 模型（可选） | 高 | 看板娘终极形态，需模型资源 |

---

## 2. 架构设计（核心）

### 2.1 角色注册表（Character Registry）

把"角色"抽象为注册表条目，**所有角色实现同一协议**，页宠主组件只认协议不认具体角色：

```ts
// components/pet/characters/registry.ts
interface PetCharacter {
  id: string                    // 'cloud' | 'cat' | 'custom'
  nameKey: string               // i18n key，如 'pet.charCloud'
  builtin?: boolean             // 是否内置（false = 用户上传的自定义形象）
  preview: string | null        // 选择器缩略图（内置角色可为 null，用 <Renderer> 渲染）
  Renderer: React.ComponentType<{ mood: PetMood; level: PetLevel }>
}

const PET_CHARACTERS: PetCharacter[] = [
  { id: 'cloud', nameKey: 'pet.charCloud', Renderer: CloudSpirit },
  { id: 'cat',   nameKey: 'pet.charCat',   Renderer: CatSpirit },
  // 用户上传的存储在 localStorage：{ id: 'custom', nameKey: 'pet.charCustom', preview: dataURL, Renderer: CustomImageRenderer }
]
```

**Pet.tsx 只改一行**：

```tsx
const character = PET_CHARACTERS.find(c => c.id === characterId) ?? PET_CHARACTERS[0]
return <character.Renderer mood={mood} level={level} />
```

### 2.2 等级装饰抽离（关键重构）

当前星星/王冠/彩虹/zzz 画死在 `CloudSpirit` 内部。改为**独立装饰层**，所有角色共用：

```tsx
// components/pet/LevelDecor.tsx —— 叠加在角色上方的等级/情绪装饰
export default function LevelDecor({ mood, level }: { mood: PetMood; level: PetLevel }) {
  return (
    <>
      {level >= 2 && <StarBadge />}      {/* Lv2 星星 */}
      {level >= 3 && <CrownBadge />}     {/* Lv3 王冠 */}
      {mood === 'celebrate' && <Rainbow />}
      {mood === 'sleep' && <Zzz />}
    </>
  )
}
```

角色组件只负责"身体"，装饰统一由 `LevelDecor` 叠加 → **新增角色零装饰成本**。

### 2.3 情绪协议

角色必须响应 5 种情绪。内置 SVG 角色用约定的 CSS 类（`.pet-<mood>`）驱动动画；用户上传图片用**容器级动画**（呼吸/弹跳/压扁对任何图片生效）：

```css
.pet-custom-image {          /* 用户上传形象 */
  width: 100%; height: 100%;
  object-fit: contain;
  animation: pet-breathe 3.2s ease-in-out infinite;   /* 复用现有 keyframes */
}
.pet-custom-image.pet-celebrate { animation: pet-jump 0.55s ease-in-out infinite; }
```

### 2.4 Store 扩展

```ts
// usePetStore 增加
characterId: string          // 'cloud' | 'cat' | 'custom'
setCharacter: (id: string) => void
customImage: string | null   // 用户上传的 base64 图片
setCustomImage: (dataUrl: string | null) => void
petColor: string             // 自定义主色（一期颜色自定义）
setPetColor: (color: string) => void
// 全部持久化到 localStorage pet.config
```

---

## 3. 分期方案细节

### 一期：内置多角色 + 颜色自定义（推荐先做）

**新增角色示例「笔记猫墨墨」**：

```tsx
// characters/CatSpirit.tsx —— 与 CloudSpirit 同协议
export default function CatSpirit({ mood, level }: Props) {
  return (
    <svg viewBox="0 0 120 90" className={`pet-cloud pet-${mood}`}>
      {/* 猫头 + 耳朵 + 胡须 + 尾巴，品牌蓝为主色 */}
      {/* 等级/情绪装饰交给 <LevelDecor>，本组件不画 */}
    </svg>
  )
}
```

**颜色自定义**：SVG 主体填充改为 CSS 变量（`--pet-body` 已存在），色板选择器写入该变量：

```tsx
<svg style={{ '--pet-body': petColor } as React.CSSProperties}>
```

### 二期：用户上传形象（贴纸模式）

| 项 | 方案 |
| --- | --- |
| 上传格式 | PNG（透明底最佳）、GIF、WebP |
| 存储 | localStorage base64（**限 500KB**，超限提示压缩）；后端方案可走现有 `/file/upload/` |
| 渲染 | `<img className="pet-custom-image">` + 容器级动画（呼吸/弹跳/压扁/zzz） |
| 等级表现 | 星星/王冠用 `LevelDecor` 绝对定位叠加在图片上 |
| 情绪表现 | 无法换表情 → 简化：idle 呼吸、celebrate 弹跳+彩虹、sleep 压扁+zzz、talk 弹跳（气泡承担表达） |
| 移除 | "恢复默认"按钮清除 localStorage 中的自定义形象 |

**实现要点**：`CustomImageRenderer` 组件：

```tsx
function CustomImageRenderer({ mood }: { mood: PetMood; level: PetLevel }) {
  const image = usePetStore(s => s.customImage)
  if (!image) return null
  return <img src={image} className={`pet-custom-image pet-${mood}`} alt="custom pet" />
}
```

### 三期：Live2D（可选）

- 集成 `pixi-live2d-display` 或 `oh-my-live2d`（GitHub ~2k stars）
- 内置模型列表（开源免费模型）+ 用户上传 `.model3.json` 包
- 等级/装饰与 Live2D 的融合成本较高（Live2D 自身有表情/动作系统），建议作为独立"形象类型"处理

---

## 4. 用户界面（养成页新增"形象"区块）

```
┌─ 形象 ──────────────────────────────┐
│  [内置形象]                          │
│   ☁️ 小卷(云)   🐱 墨墨(猫)   (当前选中高亮)│
│                                      │
│  [自定义形象]  ┌─────────┐            │
│  上传按钮 →   │ 预览图  │  移除恢复默认 │
│              └─────────┘            │
│  [自定义颜色]  ●●●●●● 色板           │
└──────────────────────────────────────┘
```

- 选择后右下角页宠**即时切换**
- 全部持久化（刷新保留）

---

## 5. 方案对比

| 维度 | 一期（内置+颜色） | 二期（上传图片） | 三期（Live2D） |
| --- | --- | --- | --- |
| 用户自由度 | ★★☆ | ★★★ | ★★★★ |
| 精致度 | ★★★ | ★★☆ | ★★★★★ |
| 实现成本 | 1~2 天 | 0.5~1 天 | 3~5 天 |
| 资源依赖 | 无 | 无（localStorage） | 模型文件/网络 |
| 版权风险 | 无（自绘） | 用户自担 | 模型许可 |
| 动画联动 | 完整（5 情绪） | 容器级（简化） | 完整（模型自带） |

---

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| localStorage 5MB 上限 | 图片限 500KB + 压缩提示；大文件走后端 `/file/upload/` |
| GIF+CSS 动画叠加性能 | 自定义形象时降低动画频率；`prefers-reduced-motion` 静态化 |
| 上传内容违规 | 仅本地存储不对外分发，用户自担；提供"恢复默认" |
| 多角色维护成本 | 注册表 + 装饰抽离后，新角色只需画"身体" |
| 情绪表达弱化（贴纸模式） | 气泡系统承担表达（已有），动画简化可接受 |

---

## 7. 工作量估算

| 任务 | 预估 |
| --- | --- |
| 注册表架构重构 + 装饰抽离 | 0.5~1 天 |
| 新角色「笔记猫墨墨」 | 0.5~1 天 |
| 颜色自定义 | 0.5 天 |
| 上传自定义形象（含压缩/校验/移除） | 0.5~1 天 |
| 养成页形象选择 UI + i18n | 0.5 天 |
| **一期合计** | **2~3 天** |

---

## 8. 建议落地顺序

1. **先做一期**（内置多角色 + 颜色）：架构升级 + 立即可用的新形象，风险最低
2. **再做二期**（上传自定义）：用户自由度拉满，体验闭环
3. 三期 Live2D 视用户反馈再定
