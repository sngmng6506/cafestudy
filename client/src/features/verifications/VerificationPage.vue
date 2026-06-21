<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Camera, History, Image as ImageIcon, RotateCcw } from '@lucide/vue';
import { apiFetch } from '../../shared/api.js';
import { compressImage } from '../../shared/image-compression.js';

const photoInput = ref(null);
const meetups = ref([]);
const myVerifications = ref([]);
const selectedMeetupId = ref('');
const compressedFile = ref(null);
const previewUrl = ref('');
const originalSize = ref(0);
const status = ref('');
const errorMessage = ref('');
const submitting = ref(false);
const showSuccessEffect = ref(false);

// Only meetups I host can be verified.
const hostMeetups = computed(() =>
  [...meetups.value]
    .filter((meetup) => meetup.isHost)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
);
const selectedMeetup = computed(
  () => hostMeetups.value.find((meetup) => meetup.id === selectedMeetupId.value) ?? null,
);
const verifiedIds = computed(() => new Set(myVerifications.value.map((v) => v.meetupId)));
const alreadyVerified = computed(() =>
  selectedMeetup.value ? verifiedIds.value.has(selectedMeetup.value.id) : false,
);
const notStarted = computed(() => (selectedMeetup.value ? selectedMeetup.value.state !== 'done' : false));
const canVerify = computed(() => !!selectedMeetup.value && !notStarted.value && !alreadyVerified.value);

const gateMessage = computed(() => {
  if (!selectedMeetup.value) return '';
  if (notStarted.value) return '이 모임은 아직 시작 전이에요. 모임 시작 시간 이후에 인증할 수 있어요.';
  if (alreadyVerified.value) return '이미 인증한 모임이에요. (중복 인증 불가)';
  return '';
});

const compressedSize = computed(() => compressedFile.value?.size ?? 0);
const compressionRatio = computed(() => {
  if (!originalSize.value || !compressedSize.value) return '';
  const ratio = Math.round((1 - compressedSize.value / originalSize.value) * 100);
  return `${Math.max(0, ratio)}% 감소`;
});

onBeforeUnmount(() => {
  clearPreviewUrl();
});

onMounted(() => {
  void loadMeetups();
  void loadMyVerifications();
});

async function loadMeetups() {
  try {
    const body = await apiFetch('/api/meetups');
    meetups.value = body.data;
    if (!selectedMeetupId.value) {
      selectedMeetupId.value = hostMeetups.value[0]?.id ?? '';
    }
  } catch (error) {
    errorMessage.value = error.message;
  }
}

async function loadMyVerifications() {
  try {
    const body = await apiFetch('/api/verifications');
    myVerifications.value = body.data;
  } catch {
    // verification history is non-critical; ignore load errors
  }
}

function openCamera() {
  photoInput.value?.click();
}

async function handlePhotoChange(event) {
  const [file] = event.target.files ?? [];
  resetPhoto();

  if (!file) return;

  originalSize.value = file.size;
  status.value = '압축 중입니다.';

  try {
    const nextFile = await compressImage(file, { maxEdge: 1600, quality: 0.8 });
    compressedFile.value = nextFile;
    previewUrl.value = URL.createObjectURL(nextFile);
    status.value = '압축본이 준비되었습니다.';
  } catch (error) {
    errorMessage.value = error.message;
    status.value = '';
  } finally {
    event.target.value = '';
  }
}

function resetPhoto() {
  clearPreviewUrl();
  compressedFile.value = null;
  originalSize.value = 0;
  status.value = '';
  errorMessage.value = '';
  showSuccessEffect.value = false;
}

async function submitVerification() {
  errorMessage.value = '';

  if (!selectedMeetup.value) {
    errorMessage.value = '인증할 모임을 선택하세요.';
    return;
  }
  if (notStarted.value) {
    errorMessage.value = '모임 시작 시간 이후에 인증할 수 있어요.';
    return;
  }
  if (alreadyVerified.value) {
    errorMessage.value = '이미 인증한 모임이에요.';
    return;
  }
  if (!compressedFile.value) {
    errorMessage.value = '인증 사진을 먼저 촬영하세요.';
    return;
  }

  submitting.value = true;
  status.value = '업로드 중입니다.';

  try {
    const upload = await apiFetch('/api/verifications/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetupId: selectedMeetupId.value,
        contentType: compressedFile.value.type,
      }),
    });

    const uploadResponse = await fetch(upload.data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': compressedFile.value.type },
      body: compressedFile.value,
    });

    if (!uploadResponse.ok) {
      throw new Error('사진 업로드에 실패했습니다.');
    }

    await apiFetch('/api/verifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetupId: selectedMeetupId.value,
        photoUrl: upload.data.photoUrl,
      }),
    });

    // Clear the photo but keep the success message.
    clearPreviewUrl();
    compressedFile.value = null;
    originalSize.value = 0;
    status.value = '인증이 완료되어 10점이 지급되었습니다.';
    triggerSuccessEffect();
    await loadMyVerifications();
  } catch (error) {
    errorMessage.value = error.message;
    status.value = '';
  } finally {
    submitting.value = false;
  }
}

function triggerSuccessEffect() {
  showSuccessEffect.value = true;
  window.setTimeout(() => {
    showSuccessEffect.value = false;
  }, 1200);
}

function clearPreviewUrl() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = '';
  }
}

function formatBytes(bytes) {
  if (!bytes) return '-';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
</script>

<template>
  <section class="grid gap-5">
    <section class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <Camera :size="18" class="text-[#16A34A]" />
        <h2 class="text-lg font-semibold text-[#191F28]">사진 인증</h2>
      </div>

      <p v-if="hostMeetups.length === 0" class="rounded-2xl border border-dashed border-[#E5E8EB] bg-[#F9FAFB] px-5 py-10 text-center text-[15px] text-[#8B95A1]">
        아직 개설한 모임이 없어요. 모임 탭에서 모임을 먼저 만들면 인증할 수 있어요.
      </p>

      <template v-else>
        <p class="mb-5 text-[15px] leading-7 text-[#8B95A1]">
          내가 연 모임의 현장 사진을 올려 인증하세요. 모임 시작 시간 이후에 가능하고,
          원본 대신 압축본만 업로드합니다.
        </p>

        <label class="mb-1 grid gap-2 text-sm font-semibold text-[#191F28]">
          내가 연 모임
          <select
            v-model="selectedMeetupId"
            class="h-12 rounded-xl border border-[#E5E8EB] bg-white px-4 text-[15px] font-medium outline-none transition focus:border-[#16A34A]"
          >
            <option value="" disabled>모임을 선택하세요</option>
            <option v-for="meetup in hostMeetups" :key="meetup.id" :value="meetup.id">
              {{ meetup.title }}
            </option>
          </select>
        </label>

        <p v-if="gateMessage" class="mb-4 mt-1 text-sm font-semibold text-[#8B95A1]">{{ gateMessage }}</p>
        <div v-else class="mb-4"></div>

        <input
          ref="photoInput"
          class="visually-hidden"
          type="file"
          accept="image/*"
          capture="environment"
          @change="handlePhotoChange"
        />

        <button
          class="mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] text-[15px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="!canVerify"
          @click="openCamera"
        >
          <Camera :size="18" />
          사진 촬영
        </button>

        <button
          v-if="compressedFile"
          class="mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E8EB] bg-white text-[15px] font-semibold text-[#191F28] transition hover:bg-[#F9FAFB]"
          type="button"
          @click="resetPhoto"
        >
          <RotateCcw :size="16" />
          다시 촬영
        </button>

        <button
          class="flex h-12 w-full items-center justify-center rounded-xl bg-[#16A34A] text-[15px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="submitting || !compressedFile || !canVerify"
          @click="submitVerification"
        >
          인증 제출
        </button>

        <div v-if="showSuccessEffect" class="success-burst" aria-hidden="true">
          <span v-for="index in 12" :key="index" />
        </div>

        <div v-if="status" class="mt-4 rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
          <p class="text-sm font-semibold text-[#16A34A]">{{ status }}</p>
          <p v-if="showSuccessEffect" class="mt-1 text-2xl font-bold text-[#191F28]">+10 포인트</p>
        </div>
        <p v-if="errorMessage" class="mt-4 text-sm font-semibold text-[#F04452]">{{ errorMessage }}</p>
      </template>
    </section>

    <section v-if="previewUrl" class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <ImageIcon :size="18" class="text-[#16A34A]" />
        <h2 class="text-lg font-semibold text-[#191F28]">압축 결과</h2>
      </div>

      <div class="overflow-hidden rounded-2xl border border-[#E5E8EB] bg-[#F9FAFB]">
        <img class="block max-h-[520px] w-full object-contain" :src="previewUrl" alt="압축된 인증 사진 미리보기" />
      </div>

      <dl class="mt-5 grid grid-cols-3 gap-3">
        <div class="rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
          <dt class="text-sm font-semibold text-[#8B95A1]">원본</dt>
          <dd class="mt-1 text-base font-bold text-[#191F28]">{{ formatBytes(originalSize) }}</dd>
        </div>
        <div class="rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
          <dt class="text-sm font-semibold text-[#8B95A1]">압축본</dt>
          <dd class="mt-1 text-base font-bold text-[#191F28]">{{ formatBytes(compressedSize) }}</dd>
        </div>
        <div class="rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] p-4">
          <dt class="text-sm font-semibold text-[#8B95A1]">절감</dt>
          <dd class="mt-1 text-base font-bold text-[#191F28]">{{ compressionRatio || '-' }}</dd>
        </div>
      </dl>
    </section>

    <section class="rounded-2xl border border-[#E5E8EB] bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center gap-2">
        <History :size="18" class="text-[#16A34A]" />
        <h2 class="text-lg font-semibold text-[#191F28]">인증 내역</h2>
      </div>

      <p v-if="myVerifications.length === 0" class="py-6 text-[15px] text-[#8B95A1]">
        아직 인증한 모임이 없어요.
      </p>
      <ul v-else class="grid gap-3">
        <li
          v-for="verification in myVerifications"
          :key="verification.id"
          class="flex items-center gap-3 rounded-xl border border-[#E5E8EB] bg-[#F9FAFB] p-3"
        >
          <img
            v-if="verification.photoViewUrl"
            :src="verification.photoViewUrl"
            class="h-14 w-14 shrink-0 rounded-lg object-cover"
            alt="인증 사진"
          />
          <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#E5E8EB] text-[#8B95A1]" v-else>
            <ImageIcon :size="18" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold text-[#191F28]">{{ verification.meetupTitle }}</p>
            <p class="mt-0.5 text-sm font-medium text-[#8B95A1]">{{ formatDate(verification.createdAt) }}</p>
          </div>
          <strong class="shrink-0 text-sm font-bold text-[#16A34A]">+{{ verification.pointsAwarded }}</strong>
        </li>
      </ul>
    </section>
  </section>
</template>
