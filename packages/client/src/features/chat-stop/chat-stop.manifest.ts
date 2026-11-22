import type { FeatureManifest } from '../../core/feature'

export default {
  id: 'chatStop',
  order: 268,
  ungated: '已发送与停止站在最后一条用户消息下方，只在它的回合在跑时出现，补上宿主停止位在草稿非空时让出的空当（D76）',
  contracts: ['chat.user-row', 'conversation.session-ancestor'],
  stylesheets: [{ file: 'chat-stop.css', rank: 131 }],
  cases: [],
} satisfies FeatureManifest
