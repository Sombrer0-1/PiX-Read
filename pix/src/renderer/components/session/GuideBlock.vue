<script setup lang="ts">
/**
 * GuideBlock - actionable guidance card in the session stream
 *
 * Warning-toned hint with a single primary action; the parent owns navigation.
 */
defineProps<{
  message: string;
}>();

const emit = defineEmits<{
  "open-settings": [];
}>();
</script>

<template>
  <div class="guide-block">
    <div class="guide-header">
      <v-icon size="14" class="guide-icon">mdi-alert-outline</v-icon>
      <span class="guide-label">配置提示</span>
    </div>
    <div class="guide-message">{{ message }}</div>
    <button type="button" class="guide-action" @click="emit('open-settings')">
      <v-icon size="14">mdi-cog-outline</v-icon>
      <span>打开设置</span>
    </button>
  </div>
</template>

<style scoped>
.guide-block {
  margin-bottom: var(--pix-space-xl);
  padding: var(--pix-space-md);
  background: var(--pix-warning-bg);
  border: 1px solid var(--pix-warning-light);
  border-radius: var(--pix-radius-lg);
  box-shadow: var(--pix-shadow-xs);
}

.guide-header {
  display: flex;
  align-items: center;
  gap: var(--pix-space-sm);
  margin-bottom: var(--pix-space-sm);
}

.guide-icon {
  color: var(--pix-warning);
}

.guide-label {
  font-size: var(--pix-text-xs);
  font-weight: 600;
  color: var(--pix-warning);
}

.guide-message {
  font-size: var(--pix-text-sm);
  color: var(--pix-text-primary);
  line-height: var(--pix-leading-base);
  white-space: pre-wrap;
  word-break: break-word;
}

.guide-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: var(--pix-space-sm);
  padding: 4px 10px;
  border: none;
  border-radius: 8px;
  background: var(--pix-accent, #31424f);
  color: #ffffff;
  font-size: var(--pix-text-xs);
  cursor: pointer;
}

.guide-action:hover {
  background: var(--pix-accent-hover, #253440);
}
</style>
