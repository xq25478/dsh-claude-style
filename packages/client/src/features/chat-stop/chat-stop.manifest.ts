import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'chatStop',
  order: 268,
  ungated: '停止按钮只在会话有回合在跑时出现在输入框右侧，补上宿主在草稿非空时让出的停止位（D76）',
  contracts: ['conversation.session-ancestor'],
  stylesheets: [{ file: 'chat-stop.css', rank: 131 }],
  cases: [],
} satisfies FeatureManifest
