/**
 * 主形象的 appearanceIndex 值。
 * 所有判断主/子形象的逻辑必须引用此常量，禁止硬编码数字。
 * 子形象的 appearanceIndex 从 PRIMARY_APPEARANCE_INDEX + 1 开始递增。
 */
export const PRIMARY_APPEARANCE_INDEX = 0

// 比例配置（nanobanana 支持的所有比例，按常用程度排序）
export const ASPECT_RATIO_CONFIGS: Record<string, { label: string; isVertical: boolean }> = {
  '16:9': { label: '16:9', isVertical: false },
  '9:16': { label: '9:16', isVertical: true },
  '1:1': { label: '1:1', isVertical: false },
  '3:2': { label: '3:2', isVertical: false },
  '2:3': { label: '2:3', isVertical: true },
  '4:3': { label: '4:3', isVertical: false },
  '3:4': { label: '3:4', isVertical: true },
  '5:4': { label: '5:4', isVertical: false },
  '4:5': { label: '4:5', isVertical: true },
  '21:9': { label: '21:9', isVertical: false },
}

// 配置页面使用的选项列表（从 ASPECT_RATIO_CONFIGS 派生）
export const VIDEO_RATIOS = Object.entries(ASPECT_RATIO_CONFIGS).map(([value, config]) => ({
  value,
  label: config.label
}))

// 获取比例配置
export function getAspectRatioConfig(ratio: string) {
  return ASPECT_RATIO_CONFIGS[ratio] || ASPECT_RATIO_CONFIGS['16:9']
}

export const ANALYSIS_MODELS = [
  { value: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { value: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite' },
  { value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' }
]

export const IMAGE_MODELS = [
  { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0' }
]

// 图像模型选项（ 生成完整图片）
export const IMAGE_MODEL_OPTIONS = [
  { value: 'banana', label: 'Banana Pro (FAL)' },
  { value: 'banana-2', label: 'Banana 2 (FAL)' },
  { value: 'gemini-3-pro-image-preview', label: 'Banana (Google)' },
  { value: 'gemini-3-pro-image-preview-batch', label: 'Banana (Google Batch) -50%' },
  { value: 'doubao-seedream-4-0-250828', label: 'Seedream 4.0' },
  { value: 'doubao-seedream-4-5-251128', label: 'Seedream 4.5' },
  { value: 'imagen-4.0-generate-001', label: 'Imagen 4.0 (Google)' },
  { value: 'imagen-4.0-ultra-generate-001', label: 'Imagen 4.0 Ultra' },
  { value: 'imagen-4.0-fast-generate-001', label: 'Imagen 4.0 Fast' }
]

// Banana 模型分辨率选项（仅用于九宫格分镜图，单张生成固定2K）
export const BANANA_RESOLUTION_OPTIONS = [
  { value: '2K', label: '2K (Recommended, Fast)' },
  { value: '4K', label: '4K (HD, Slower)' }
]

// 支持分辨率选择的 Banana 模型
export const BANANA_MODELS = ['banana', 'banana-2', 'gemini-3-pro-image-preview', 'gemini-3-pro-image-preview-batch']

export const VIDEO_MODELS = [
  { value: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0' },
  { value: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast' },
  { value: 'doubao-seedance-1-0-pro-fast-251015', label: 'Seedance 1.0 Pro Fast' },
  { value: 'doubao-seedance-1-0-pro-fast-251015-batch', label: 'Seedance 1.0 Pro Fast (Batch) -50%' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428', label: 'Seedance 1.0 Lite' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428-batch', label: 'Seedance 1.0 Lite (Batch) -50%' },
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro' },
  { value: 'doubao-seedance-1-5-pro-251215-batch', label: 'Seedance 1.5 Pro (Batch) -50%' },
  { value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro' },
  { value: 'doubao-seedance-1-0-pro-250528-batch', label: 'Seedance 1.0 Pro (Batch) -50%' },
  { value: 'fal-wan25', label: 'Wan 2.6' },
  { value: 'fal-veo31', label: 'Veo 3.1 Fast' },
  { value: 'fal-sora2', label: 'Sora 2' },
  { value: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', label: 'Kling 2.5 Turbo Pro' },
  { value: 'fal-ai/kling-video/v3/standard/image-to-video', label: 'Kling 3 Standard' },
  { value: 'fal-ai/kling-video/v3/pro/image-to-video', label: 'Kling 3 Pro' }
]

// SeeDream 批量模型列表（使用 GPU 空闲时间，成本降低50%）
export const SEEDANCE_BATCH_MODELS = [
  'doubao-seedance-1-5-pro-251215-batch',
  'doubao-seedance-1-0-pro-250528-batch',
  'doubao-seedance-1-0-pro-fast-251015-batch',
  'doubao-seedance-1-0-lite-i2v-250428-batch',
]

// 支持生成音频的模型
export const AUDIO_SUPPORTED_MODELS = [
  'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-1-5-pro-251215',
  'doubao-seedance-1-5-pro-251215-batch',
]

// 首尾帧视频模型（能力权威来源是 standards/capabilities；此常量仅作静态兜底展示）
export const FIRST_LAST_FRAME_MODELS = [
  { value: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0 (First-Last Frame)' },
  { value: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast (First-Last Frame)' },
  { value: 'doubao-seedance-1-5-pro-251215', label: 'Seedance 1.5 Pro (First-Last Frame)' },
  { value: 'doubao-seedance-1-5-pro-251215-batch', label: 'Seedance 1.5 Pro (First-Last/Batch) -50%' },
  { value: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro (First-Last Frame)' },
  { value: 'doubao-seedance-1-0-pro-250528-batch', label: 'Seedance 1.0 Pro (First-Last/Batch) -50%' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428', label: 'Seedance 1.0 Lite (First-Last Frame)' },
  { value: 'doubao-seedance-1-0-lite-i2v-250428-batch', label: 'Seedance 1.0 Lite (First-Last/Batch) -50%' },
  { value: 'veo-3.1-generate-preview', label: 'Veo 3.1 (First-Last Frame)' },
  { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast (First-Last Frame)' }
]

export const VIDEO_RESOLUTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' }
]

export const TTS_RATES = [
  { value: '+0%', label: '正常速度 (1.0x)' },
  { value: '+20%', label: '轻微加速 (1.2x)' },
  { value: '+50%', label: '加速 (1.5x)' },
  { value: '+100%', label: '快速 (2.0x)' }
]

export const TTS_VOICES = [
  { value: 'zh-CN-YunxiNeural', label: '云希 (男声)', preview: '男' },
  { value: 'zh-CN-XiaoxiaoNeural', label: '晓晓 (女声)', preview: '女' },
  { value: 'zh-CN-YunyangNeural', label: '云扬 (男声)', preview: '男' },
  { value: 'zh-CN-XiaoyiNeural', label: '晓伊 (女声)', preview: '女' }
]

export const ART_STYLES = [
  {
    value: 'american-comic',
    label: 'American Comic',
    preview: 'AC',
    promptZh: '美式漫画风格，粗犷有力的线条，鲜明的色彩对比，美式超级英雄漫画质感，高质量2D风格',
    promptEn: 'American comic book style, bold dynamic line art, vibrant color contrast, superhero comic aesthetic, high-quality 2D style.'
  },
  {
    value: 'chinese-comic',
    label: 'Chinese Comic',
    preview: 'CC',
    promptZh: '现代高质量漫画风格，动漫风格，细节丰富精致，线条锐利干净，质感饱满，超清，干净的画面风格，2D风格，动漫风格。',
    promptEn: 'Modern premium Chinese comic style, rich details, clean sharp line art, full texture, ultra-clear 2D anime aesthetics.'
  },
  {
    value: 'chinese-comic-cg',
    label: 'Chinese Comic-CG',
    preview: 'CC',
    promptZh: 'artwork in cgstyle_9b, iray风格渲染，物理真实的光影感，2.5D半写实风格，现代高质量国漫风格，细节丰富精致，线条锐利干净，皮肤材质通透红润极其光滑(3S渲染)，柔和赛璐璐上色带细腻光影过渡，质感饱满，超清，干净的画面风格，高质量国漫CG。',
    promptEn: 'artwork in cgstyle_9b, iray rendering, physically accurate lighting, 2.5D semi-realistic style. Modern premium Chinese comic style, rich details, clean sharp line art, SSS skin with translucent rosy tone, soft cel shading with subtle gradient and rim light, full texture, ultra-clear high-quality Chinese comic CG.'
  }
  ,
  {
    value: 'japanese-anime',
    label: 'Anime Nhật',
    preview: '日',
    promptZh: '现代日系动漫风格，赛璐璐上色，清晰干净的线条，视觉小说CG感，精致的眼睛与发丝细节，现代都市街景背景，柔和的自然光影，高饱和度清新色彩，高质量2D动漫。',
    promptEn: 'Modern Japanese anime style, clean crisp line art, beautiful detailed eyes and hair, flat cel shading, visual novel CG look, modern urban street background with soft bokeh, gentle natural lighting, fresh vibrant colors, premium high-quality 2D digital anime.'
  },
  {
    value: 'japanese-anime-cg',
    label: 'Anime Nhật-CG',
    preview: '日',
    promptZh: 'artwork in cgstyle_9b, 2.5D semi-realistic style，现代日系动漫风格，柔和赛璐璐上色，带细腻光影过渡，清晰干净的线条，视觉小说CG感，精致的眼睛与发丝细节，现代都市街景背景，柔和的自然光影，高饱和度清新色彩，高质量动漫CG。',
    promptEn: 'artwork in cgstyle_9b, iray rendering, physically accurate lighting, 2.5D semi-realistic style. Modern Japanese anime style, clean crisp line art, beautiful detailed eyes and hair, SSS skin with translucent rosy tone, soft cel shading with subtle gradient and rim light, visual novel CG look, modern urban street background with soft bokeh, gentle natural lighting, fresh vibrant colors, premium high-quality anime CG.'
  },
  {
    value: 'cg-2-5d',
    label: 'CG 2.5D Semi-Realistic',
    preview: 'CG',
    promptZh: 'artwork in cgstyle_9b, 极致CG质感与3S皮肤渲染，Iray风格光照，物理真实的光影感，画面通透富有深度，皮肤材质通透红润极其光滑，动漫转CG写实质感，高细节皮肤纹理，电影级渲染品质，2.5D半写实风格。',
    promptEn: 'artwork in cgstyle_9b, ultimate CG texture with Iray skin rendering, realistic physical light and shadow, transparent and deep imagery, translucent rosy smooth skin texture, anime-to-CG transformation, high-detail skin surface, cinematic render quality, 2.5D semi-realistic style.'
  },
  {
    value: 'realistic',
    label: 'Realistic',
    preview: 'RL',
    promptZh: '真实电影级画面质感，真实现实场景，色彩饱满通透，画面干净精致，真实感',
    promptEn: 'Realistic cinematic look, real-world scene fidelity, rich transparent colors, clean and refined image quality.'
  },
  {
    value: 'vector-cartoon',
    label: 'Hoạt hình cắt giấy 2D (Review)',
    preview: 'Cắt',
    promptZh: '简约2D解说视频卡通风格，类似中国抖音解说剪纸木偶风格，鲜明利落的黑色粗线条描边，扁平赛璐璐上色，角色比例略带Q版（大头小身体），无阴影细节，极简纯色背景，高对比度，干净清爽的2D角色设计。',
    promptEn: 'Minimalist 2D story review cartoon style, inspired by Chinese TikTok cartoon puppet animation, prominent clean thick black outlines, flat cel-shading with zero gradient shadows, slightly chibi character proportions (larger head, small body), simple solid plain colored background, high-contrast, clean 2D paper-doll character assets.'
  },
  {
    value: 'chibi-kawaii',
    label: 'Chibi dễ thương',
    preview: 'Ch',
    promptZh: 'Chibi风格，大头小身体，Q版角色比例，圆圆的脸蛋大大的眼睛，可爱萌系画风，线条柔和温暖，色彩明亮鲜艳，日本可爱动漫风格，2D动画质感。',
    promptEn: 'Chibi kawaii style, big head small body, Q-version character proportions, round face with large sparkling eyes, cute and adorable aesthetic, soft warm lines, bright cheerful colors, Japanese cute anime style, 2D animation feel.'
  },
  {
    value: 'korean-webtoon-cute',
    label: 'Truyện tranh Hàn',
    preview: 'Kr',
    promptZh: '韩国webtoon漫画风格，角色比例修长，大眼睛闪亮，五官精致柔和，上色清透光亮，画面干净整洁，少女漫画质感，清新唯美，2D风格。',
    promptEn: 'Korean webtoon comic style, slender character proportions, large shiny eyes, delicate soft facial features, clear luminous coloring, clean crisp artwork, romantic comic质感, fresh and aesthetic, 2D style.'
  },
  {
    value: 'disney-3d',
    label: '3D Disney/Pixar',
    preview: '3D',
    promptZh: 'Disney Pixar风格3D渲染，角色造型圆润可爱，表情生动丰富，皮肤质感细腻，毛发细节丰富，色彩饱和温暖，灯光柔和自然，卡通写实风格，皮克斯电影质感。',
    promptEn: 'Disney Pixar style 3D render, round cute character design, expressive lively faces, smooth skin texture, detailed hair, saturated warm colors, soft natural lighting, cartoon realism, Pixar film quality.'
  },
  {
    value: 'chinese-historical-short-drama',
    label: 'Phim ngắn cổ trang',
    preview: 'Cổ',
    promptZh: '中国古装微短剧风格，汉服，电影级唯美画面质感，真实写实场景，夕阳斜照或柔和黄昏光影，华丽古典的中式建筑庭院群low，雕梁画栋，高饱和度与丰富色彩对比，角色皮肤质感真实细腻，古装衣物材质细节饱满，高端短剧胶片质感。',
    promptEn: 'Chinese historical short drama style, hanfu, premium live-action cinematic drama aesthetic, real-world ancient architecture scenery, ornate pavilions with moon gates, warm late afternoon golden hour lighting, rich contrast with atmospheric storytelling shadows, photorealistic skin texture, ultra-detailed costume fabric, high-end vertical film look.'
  },
  {
    value: 'chinese-paper-cut',
    label: 'Cắt giấy Trung Hoa',
    preview: 'Cắt',
    promptZh: '精致中国传统剪纸风格，阴刻与阳刻结合，精细的镂空纸雕质感，多层纸张重叠的3D皮影戏舞台效果，鲜艳对比的红、金、黑、蓝色彩，古风国潮插画，独特的中式民间艺术美学，微距景深。',
    promptEn: 'Exquisite traditional Chinese paper-cut art style, delicate paper hollow-out carving texture, multi-layered 3D papercut shadow box effect, vibrant high-contrast colors (crimson red, gold, black, teal), Chinese folk art aesthetics, ornate traditional patterns, elegant stylized silhouettes, macro depth of field.'
  },
]

export type ArtStyleValue = (typeof ART_STYLES)[number]['value']

export function isArtStyleValue(value: unknown): value is ArtStyleValue {
  return typeof value === 'string' && ART_STYLES.some((style) => style.value === value)
}

/**
 * 🔥 实时从 ART_STYLES 常量获取风格 prompt
 * 这是获取风格 prompt 的唯一正确方式，确保始终使用最新的常量定义
 * 
 * @param artStyle - 风格标识符，如 'realistic', 'american-comic' 等
 * @returns 对应的风格 prompt，如果找不到则返回空字符串
 */
export function getArtStylePrompt(
  artStyle: string | null | undefined,
  locale: 'zh' | 'en',
): string {
  if (!artStyle) return ''
  const style = ART_STYLES.find(s => s.value === artStyle)
  if (!style) return ''
  return locale === 'en' ? style.promptEn : style.promptZh
}

// 角色形象生成的系统后缀（始终添加到提示词末尾，不显示给用户）- 左侧面部特写+右侧三视图
export const CHARACTER_PROMPT_SUFFIX_ZH = '角色设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是角色的正面特写（如果是人类则展示完整正脸，如果是动物/生物则展示最具辨识度的正面形态）；【右侧区域】占约2/3宽度，是角色三视图横向排列（从左到右依次为：正面全身、侧面全身、背面全身），三视图高度一致。纯白色背景，无其他元素。'
export const CHARACTER_PROMPT_SUFFIX_EN = 'Character design sheet, the screen is divided into left and right areas: [Left Area] occupying about 1/3 width, showing a front close-up of the character (full front face for humans, most recognizable front angle for creatures/animals); [Right Area] occupying about 2/3 width, showing a three-view orthographic layout of the character arranged horizontally (from left to right: front full-body, side full-body, back full-body), all three views having consistent height. Pure white background, no other elements.'
export const CHARACTER_PROMPT_SUFFIX = CHARACTER_PROMPT_SUFFIX_ZH

// 道具图片生成的系统后缀（固定白底三视图资产图）
export const PROP_PROMPT_SUFFIX_ZH = '道具设定图，画面分为左右两个区域：【左侧区域】占约1/3宽度，是道具主体的主视图特写；【右侧区域】占约2/3宽度，是同一道具的三视图横向排列（从左到右依次为：正面、侧面、背面），三视图高度一致。纯白色背景，主体居中完整展示，无人物、无手部、无桌面陈设、无环境背景、无其他元素。'
export const PROP_PROMPT_SUFFIX_EN = 'Prop design sheet, the screen is divided into left and right areas: [Left Area] occupying about 1/3 width, showing a main-view close-up of the prop; [Right Area] occupying about 2/3 width, showing a three-view orthographic layout of the same prop arranged horizontally (from left to right: front, side, back), all three views having consistent height. Pure white background, the main object is fully displayed in the center, no people, no hands, no tabletop settings, no environment/background, no other elements.'
export const PROP_PROMPT_SUFFIX = PROP_PROMPT_SUFFIX_ZH

// 场景图片生成的系统后缀（已禁用四视图，直接生成单张场景图）
export const LOCATION_PROMPT_SUFFIX = ''

// 角色资产图生成比例（当前角色设定图实际 sử dụng 3:2）
export const CHARACTER_ASSET_IMAGE_RATIO = '3:2'
// 历史保留：旧注释中曾写 16:9，但当前资产图生成统一以 CHARACTER_ASSET_IMAGE_RATIO 为准
export const CHARACTER_IMAGE_RATIO = CHARACTER_ASSET_IMAGE_RATIO
// 角色图片尺寸（用于Seedream API）
export const CHARACTER_IMAGE_SIZE = '3840x2160'  // 16:9 横版
// 角色图片尺寸（用于Banana API）
export const CHARACTER_IMAGE_BANANA_RATIO = CHARACTER_ASSET_IMAGE_RATIO

// 道具图片生成比例（与角色资产图保持一致）
export const PROP_IMAGE_RATIO = CHARACTER_ASSET_IMAGE_RATIO

// 场景图片生成比例（1:1 正方形单张场景）
export const LOCATION_IMAGE_RATIO = '1:1'
// 场景图片尺寸（用于Seedream API）- 4K
export const LOCATION_IMAGE_SIZE = '4096x4096'  // 1:1 正方形 4K
// 场景图片尺寸（用于Banana API）
export const LOCATION_IMAGE_BANANA_RATIO = '1:1'

// 从提示词中移除角色系统后缀（用于显示给用户）
export function removeCharacterPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt
    .replace(CHARACTER_PROMPT_SUFFIX_ZH, '')
    .replace(CHARACTER_PROMPT_SUFFIX_EN, '')
    .trim()
}

// 添加角色系统后缀到提示词（用于生成图片）
export function addCharacterPromptSuffix(prompt: string, locale: 'zh' | 'en' = 'en'): string {
  const suffix = locale === 'en' ? CHARACTER_PROMPT_SUFFIX_EN : CHARACTER_PROMPT_SUFFIX_ZH
  if (!prompt) return suffix
  const cleanPrompt = removeCharacterPromptSuffix(prompt)
  const sep = locale === 'en' ? ', ' : '，'
  return `${cleanPrompt}${cleanPrompt ? sep : ''}${suffix}`
}

export function removePropPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt
    .replace(PROP_PROMPT_SUFFIX_ZH, '')
    .replace(PROP_PROMPT_SUFFIX_EN, '')
    .replace(/，$/, '')
    .replace(/,$/, '')
    .trim()
}

export function addPropPromptSuffix(prompt: string, locale: 'zh' | 'en' = 'en'): string {
  const suffix = locale === 'en' ? PROP_PROMPT_SUFFIX_EN : PROP_PROMPT_SUFFIX_ZH
  if (!prompt) return suffix
  const cleanPrompt = removePropPromptSuffix(prompt)
  const sep = locale === 'en' ? ', ' : '，'
  return `${cleanPrompt}${cleanPrompt ? sep : ''}${suffix}`
}

// 从提示词中移除场景系统后缀（用于显示给用户）
export function removeLocationPromptSuffix(prompt: string): string {
  if (!prompt) return ''
  return prompt.replace(LOCATION_PROMPT_SUFFIX, '').replace(/，$/, '').trim()
}

// 添加场景系统后缀到提示词（用于生成图片）
export function addLocationPromptSuffix(prompt: string): string {
  // 后缀为空时直接返回原提示词
  if (!LOCATION_PROMPT_SUFFIX) return prompt || ''
  if (!prompt) return LOCATION_PROMPT_SUFFIX
  const cleanPrompt = removeLocationPromptSuffix(prompt)
  return `${cleanPrompt}${cleanPrompt ? '，' : ''}${LOCATION_PROMPT_SUFFIX}`
}

/**
 * 构建角色介绍字符串（用于发送给 AI，帮助理解"我" và xưng hô tương ứng）
 * @param characters - 角色列表，需要包含 name và introduction 字段
 * @param locale - 语言种类 ('zh' | 'en')
 * @returns 格式化的角色介绍字符串
 */
export function buildCharactersIntroduction(
  characters: Array<{ name: string; introduction?: string | null }>,
  locale: 'zh' | 'en' = 'en',
): string {
  const fallback = locale === 'en' ? 'No character introductions available' : '暂无角色介绍'
  if (!characters || characters.length === 0) return fallback

  const colon = locale === 'en' ? ': ' : '：'
  const introductions = characters
    .filter(c => c.introduction && c.introduction.trim())
    .map(c => `- ${c.name}${colon}${c.introduction}`)

  if (introductions.length === 0) return fallback

  return introductions.join('\n')
}

export const PROMPT_STRINGS = {
  none: { zh: '无', en: 'None' },
  no_description: { zh: '无描述', en: 'No description' },
  no_char_data: { zh: '无角色数据', en: 'No character data' },
  no_appearance_data: { zh: '无角色外貌数据', en: 'No character appearance data' },
  no_appearance_info: { zh: '无形象信息', en: 'No appearance info' },
  no_appearance_desc: { zh: '无形象描述', en: 'No appearance description' },
  initial_appearance: { zh: '初始形象', en: 'Initial appearance' },
  default_appearance: { zh: '默认形象', en: 'Default appearance' },
  default: { zh: '默认', en: 'Default' },
  no_char_intro: { zh: '暂无角色介绍', en: 'No character introductions available' },
  no_existing_chars: { zh: '暂无已有角色', en: 'No existing characters' },
  no_intro: { zh: '暂无', en: 'None' },
  alias: { zh: '别名', en: 'Aliases' },
  intro: { zh: '介绍', en: 'Introduction' },
  no_ref_image: { zh: '无参考图', en: 'No reference image' },
  has_ref_image: { zh: '已提供参考图', en: 'Reference image provided' },
  style_match_ref: { zh: '与参考图风格一致', en: 'Match the style of the reference image' },
  position: { zh: '位置', en: 'position' },
} as const

export function t(key: keyof typeof PROMPT_STRINGS, locale: 'zh' | 'en' = 'en'): string {
  return PROMPT_STRINGS[key][locale === 'zh' ? 'zh' : 'en']
}
