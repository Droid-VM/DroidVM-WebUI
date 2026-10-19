<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVmGraphics } from '../model/graphics'
import GraphicsPane from './GraphicsPane.vue'
import AppButton from '../../../shared/ui/AppButton.vue'

const props = defineProps<{ vmId: string; instanceId?: string }>()
const model = useVmGraphics(),
  { t } = useI18n()
type Pane = 'primary' | 'secondary'
type PaneHandle = { setInputActive(value: boolean): void }
const primary = ref<PaneHandle>(),
  secondary = ref<PaneHandle>()
const active = ref<Pane>('primary')
const adding = ref(false)
const canAdd = computed(
  () =>
    !model.secondary.value &&
    !model.busy.value &&
    !adding.value &&
    !!model.metadata.value?.screens.some(
      (screen) => screen.available && screen.id !== model.screen.value,
    ),
)

function activate(value: Pane) {
  if (value === 'secondary' && !model.secondary.value) return
  if (active.value === value) return
  // Switch the actual adapters synchronously, before the captured pointer or
  // focus event reaches noVNC. Vue prop updates alone arrive too late here.
  const previous = active.value === 'primary' ? primary.value : secondary.value
  previous?.setInputActive(false)
  active.value = value
  const current = value === 'primary' ? primary.value : secondary.value
  current?.setInputActive(true)
}
async function addScreen() {
  if (!canAdd.value) return
  adding.value = true
  try {
    await model.addSecondary()
  } finally {
    adding.value = false
  }
}
function removeScreen() {
  activate('primary')
  model.removeSecondary()
}
watch(
  () => [props.vmId, props.instanceId],
  () => {
    secondary.value?.setInputActive(false)
    active.value = 'primary'
    primary.value?.setInputActive(true)
    void model.open(props.vmId, props.instanceId)
  },
  { immediate: true },
)
watch(
  model.secondary,
  (value) => {
    if (!value) activate('primary')
  },
  { flush: 'sync' },
)
onBeforeUnmount(model.reset)
</script>

<template>
  <section class="graphics-console" :class="{ 'console-parallel': model.secondary.value }">
    <div class="console-tools">
      <AppButton
        v-if="
          !model.secondary.value &&
          model.metadata.value?.screens.some(
            (screen) => screen.available && screen.id !== model.screen.value,
          )
        "
        data-testid="graphic-add-screen"
        :disabled="!canAdd"
        @click="addScreen"
      >
        {{ t('graphicAddScreen') }}
      </AppButton>
      <p v-if="model.secondary.value">{{ t('graphicParallelHint') }}</p>
    </div>
    <div class="graphics-panes" :class="{ parallel: model.secondary.value }">
      <section
        data-testid="graphic-pane-primary"
        class="graphics-pane"
        :data-input-active="active === 'primary'"
        :aria-label="t('graphicPrimaryScreen')"
      >
        <GraphicsPane
          ref="primary"
          :model="model"
          :vm-id="vmId"
          :instance-id="instanceId"
          :active="active === 'primary'"
          :parallel="!!model.secondary.value"
          :excluded-screen="model.secondary.value?.screen.value"
          @activate="activate('primary')"
        />
      </section>
      <section
        v-if="model.secondary.value"
        data-testid="graphic-pane-secondary"
        class="graphics-pane"
        :data-input-active="active === 'secondary'"
        :aria-label="t('graphicSecondaryScreen')"
      >
        <AppButton
          data-testid="graphic-remove-screen"
          @pointerdown="activate('primary')"
          @focus="activate('primary')"
          @click="removeScreen"
          >{{ t('graphicRemoveScreen') }}</AppButton
        >
        <GraphicsPane
          ref="secondary"
          :model="model.secondary.value"
          :vm-id="vmId"
          :instance-id="instanceId"
          :active="active === 'secondary'"
          :parallel="true"
          :excluded-screen="model.screen.value"
          @activate="activate('secondary')"
        />
      </section>
    </div>
  </section>
</template>

<style scoped>
.graphics-console,
.graphics-pane {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  min-height: 0;
}
.console-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.console-tools p {
  margin: 0;
}
.graphics-panes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  min-width: 0;
  min-height: 0;
}
.console-parallel {
  flex: 0 0 auto;
  min-height: auto;
}
.graphics-panes.parallel {
  flex: 0 0 auto;
  min-height: auto;
  grid-auto-rows: max-content;
  align-items: start;
}
.parallel .graphics-pane {
  flex: 0 0 auto;
  min-height: auto;
  padding: var(--space-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.parallel .graphics-pane[data-input-active='true'] {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
@media (min-width: 1100px) {
  .graphics-panes.parallel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
