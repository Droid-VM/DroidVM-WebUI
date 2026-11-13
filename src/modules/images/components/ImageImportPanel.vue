<script setup lang="ts">
import AppLinkButton from '../../../shared/ui/AppLinkButton.vue'
import { computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useImageImport } from '../model/import'
import { taskPercent, taskStateKeys } from '../../tasks'
import AppButton from '../../../shared/ui/AppButton.vue'
import AppCheckbox from '../../../shared/ui/AppCheckbox.vue'
import AppTextField from '../../../shared/ui/AppTextField.vue'
import AppNotice from '../../../shared/ui/AppNotice.vue'
import AppProgress from '../../../shared/ui/AppProgress.vue'
import OperationTrackingNotice from '../../../shared/ui/OperationTrackingNotice.vue'
const model = useImageImport(),
  { t } = useI18n()
const entries = computed(() =>
  [model.previewEntry.value, model.entry.value].filter((row) => row !== null),
)
onBeforeUnmount(model.leave)
</script>
<template>
  <div class="image-import">
    <h1>{{ t('imageImportTitle') }}</h1>
    <AppNotice v-if="!model.supported.value" tone="warning" :title="t('imageImportUnavailable')" />
    <template v-else>
      <OperationTrackingNotice
        :problem="model.recoveryProblem.value"
        @clear="model.clearTracking"
      />
      <OperationTrackingNotice
        :problem="model.previewRecoveryProblem.value"
        @clear="model.clearPreviewTracking"
      />
      <form @submit.prevent="model.readPreview">
        <AppTextField
          v-model="model.source.value"
          :label="t('imageImportSource')"
          data-testid="image-import-source"
          :disabled="model.pending.value || !!model.entry.value"
          placeholder="/storage/emulated/0/DroidVM/linux.qcow2"
          autocomplete="off"
          spellcheck="false"
          required
        />
        <AppButton
          type="submit"
          data-testid="image-import-preview"
          :disabled="!model.canPreview.value"
          >{{ t('imageImportPreview') }}</AppButton
        >
      </form>
      <section v-if="model.plan.value" aria-labelledby="image-import-plan">
        <h2 id="image-import-plan">{{ t('imageImportPlanTitle') }}</h2>
        <p>{{ model.plan.value.source }}</p>
        <ol class="chain">
          <li v-for="(member, index) in model.plan.value.members" :key="member.id">
            <h3>{{ member.name }}</h3>
            <p>
              {{ t(index === 0 ? 'imageImportSelected' : 'imageImportParent') }} ·
              {{ t(member.existing ? 'imageImportExisting' : 'imageImportNew') }}
            </p>
            <p>
              <code>{{ member.path }}</code>
            </p>
            <p>
              {{ member.format }} · {{ t('imageImportSize', { bytes: member.virtualSizeBytes }) }}
            </p>
            <p>{{ t('imageImportDiskId') }}: {{ member.id }}</p>
            <p v-if="member.parentId">{{ t('resourceParent') }}: {{ member.parentId }}</p>
          </li>
        </ol>
        <h3>{{ t('imageImportAttachments') }}</h3>
        <p v-if="!model.plan.value.attachments.length">{{ t('imageImportNoAttachments') }}</p>
        <article
          v-for="attachment in model.plan.value.attachments"
          :key="`${attachment.vmId}:${attachment.slot}`"
          class="attachment"
        >
          <p>{{ t('imageImportAttachment', { vm: attachment.vmId, slot: attachment.slot }) }}</p>
          <dl>
            <dt>{{ t('imageImportBefore') }}</dt>
            <dd>
              {{ attachment.beforePath }} ·
              {{ t(attachment.beforeReadOnly ? 'imageImportReadOnly' : 'imageImportWritable') }}
            </dd>
            <dt>{{ t('imageImportAfter') }}</dt>
            <dd>
              {{ attachment.afterPath }} ·
              {{ t(attachment.afterReadOnly ? 'imageImportReadOnly' : 'imageImportWritable') }}
            </dd>
          </dl>
        </article>
        <template v-if="!model.entry.value">
          <AppCheckbox
            v-model="model.acknowledged.value"
            data-testid="image-import-acknowledge"
            :disabled="model.pending.value"
            >{{ t('imageImportConfirm') }}</AppCheckbox
          >
          <AppButton
            tone="primary"
            data-testid="image-import-submit"
            :disabled="!model.canSubmit.value"
            @click="model.submit"
            >{{ t('imageImportSubmit') }}</AppButton
          >
        </template>
      </section>
      <section v-if="entries.length" aria-live="polite">
        <h2>{{ t('imageImportStatus') }}</h2>
        <article v-for="entry in entries" :key="entry.request.requestId">
          <h3>{{ t('source' in entry.request ? 'imageImportPreview' : 'imageImportSubmit') }}</h3>
          <p v-if="entry.state === 'posting'">{{ t('processing') }}</p>
          <p v-if="entry.state === 'unknown'">{{ t('imageImportUnknown') }}</p>
          <p v-if="entry.task">{{ t(taskStateKeys[entry.task.state]) }}</p>
          <AppProgress
            v-if="entry.task && entry.state === 'waiting'"
            :label="t('imageImportStatus')"
            :value="taskPercent(entry.task)"
          />
          <p v-if="entry.task?.errorCode">{{ entry.task.errorCode }}</p>
          <AppNotice v-if="entry.problem" tone="error" :title="t(entry.problem.titleKey)"
            ><p>{{ t(entry.problem.descriptionKey) }}</p></AppNotice
          >
        </article>
        <div class="buttons">
          <AppButton v-if="model.canRefreshPreview.value" @click="model.refreshPreview">{{
            t('imageImportRefreshPreview')
          }}</AppButton>
          <AppButton
            data-testid="image-import-reconcile"
            :disabled="model.checking.value || entries.some((row) => row.state === 'posting')"
            @click="model.reconcile"
            >{{ t('queryStatus') }}</AppButton
          >
          <AppLinkButton tone="tonal" to="/tasks">{{ t('diskTaskLink') }}</AppLinkButton>
        </div>
      </section>
      <section v-if="model.entry.value" data-testid="image-import-result" aria-live="polite">
        <h2>{{ t('imageImportResult') }}</h2>
        <template v-if="model.result.value">
          <p>{{ t('imageImportAdded', { count: model.result.value.added }) }}</p>
          <p v-if="model.result.value.registered">{{ t('imageImportRegistered') }}</p>
          <p v-if="model.result.value.diskId">
            {{ t('imageImportDiskId') }}: {{ model.result.value.diskId }}
          </p>
        </template>
        <AppNotice
          v-if="model.recoveryRequired.value"
          tone="warning"
          :title="t('imageImportRecovery')"
          ><p>{{ t('imageImportRecoveryHint') }}</p></AppNotice
        >
        <template v-if="model.succeeded.value">
          <p>{{ t('imageImportSuccess') }}</p>
          <template v-if="model.optimizeAvailable.value">
            <AppButton
              data-testid="image-import-optimize"
              :disabled="!model.canOptimize.value"
              @click="model.optimize"
              >{{ t('imageImportOptimize') }}</AppButton
            >
            <AppNotice
              v-if="model.optimizeProblem.value"
              tone="error"
              :title="t(model.optimizeProblem.value.titleKey)"
              ><p>{{ t(model.optimizeProblem.value.descriptionKey) }}</p></AppNotice
            >
          </template>
          <div class="buttons">
            <AppLinkButton
              tone="tonal"
              :to="{
                path: '/resources/disk',
                query: { disk: model.result.value?.diskId ?? undefined },
              }"
              >{{ t('diskViewResult') }}</AppLinkButton
            >
            <AppLinkButton tone="tonal" to="/vms/new">{{ t('createVm') }}</AppLinkButton>
          </div>
        </template>
        <template v-if="model.entry.value.state === 'done'">
          <AppLinkButton tone="tonal" to="/resources/disk">{{ t('navDisk') }}</AppLinkButton>
          <AppCheckbox v-model="model.outcomeAcknowledged.value">{{
            t('imageImportOutcomeConfirm')
          }}</AppCheckbox>
          <AppButton
            data-testid="image-import-restart"
            :disabled="!model.canRestart.value || model.reviewingOutcome.value"
            @click="model.restart"
            >{{ t('imageImportRestart') }}</AppButton
          >
          <AppNotice
            v-if="model.restartProblem.value"
            tone="error"
            :title="t(model.restartProblem.value.titleKey)"
            ><p>{{ t(model.restartProblem.value.descriptionKey) }}</p></AppNotice
          >
        </template>
      </section>
    </template>
  </div>
</template>
<style scoped>
.image-import,
form,
section,
article {
  display: grid;
  min-width: 0;
  gap: var(--space-3);
  overflow-wrap: anywhere;
}
h1,
h2,
h3,
p {
  margin: 0;
}
h2,
h3 {
  font-size: var(--md-sys-typescale-title-medium-size);
}
section,
.chain li,
.attachment {
  padding: var(--space-3);
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--app-color-card);
}
.chain {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding-inline-start: 24px;
  min-width: 0;
}
.chain li > * + * {
  margin-top: var(--space-2);
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  align-items: center;
}
dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 3fr);
  gap: var(--space-2);
  margin: 0;
}
dd {
  margin: 0;
}
@media (width < 480px) {
  .buttons > *,
  form > .btn {
    width: 100%;
  }
  dl {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
