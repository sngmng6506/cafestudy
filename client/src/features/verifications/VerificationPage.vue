<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Camera, History, Image as ImageIcon, MapPin } from '@lucide/vue';
import { useMeetups, formatDate } from '../../shared/useMeetups.js';
import { useToast } from '../../shared/useToast.js';
import { apiFetch } from '../../shared/api.js';
import { compressImage } from '../../shared/image-compression.js';

const toast = useToast();
const { meetups, loadMeetups } = useMeetups();

const photoInput = ref(null);
const myVerifications = ref([]);
const selectedMeetupId = ref('');
const compressedFile = ref(null);
const previewUrl = ref('');
const originalSize = ref(0);
const status = ref('');
const submitting = ref(false);
const showSuccessEffect = ref(false);

const hostMeetups = computed(() =>
  [...meetups.value]
    .filter((meetup) => meetup.isHost)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
);

const joinedMeetups = computed(() =>
  [...meetups.value]
    .filter((m) => m.joined && !m.isHost)
    .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt)),
);

const selectedMeetup = computed(
  () => hostMeetups.value.find((meetup) => meetup.id === selectedMeetupId.value) ?? null,
);
const verifiedIds = computed(() => new Set(myVerifications.value.map((v) => v.meetupId)));
const alreadyVerified = computed(() =>
  selectedMeetup.value ? verifiedIds.value.has(selectedMeetup.value.id) : false,
);
const notStarted = computed(() =>
  selectedMeetup.value ? selectedMeetup.value.state !== 'done' : false,
);
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

onMounted(async () => {
  await loadMeetups();
  if (!selectedMeetupId.value) {
    selectedMeetupId.value = hostMeetups.value[0]?.id ?? '';
  }
  void loadMyVerifications();
});

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
    toast.error(error.message);
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
  showSuccessEffect.value = false;
}

async function submitVerification() {
  if (!selectedMeetup.value) {
    toast.error('인증할 모임을 선택하세요.');
    return;
  }
  if (notStarted.value) {
    toast.error('모임 시작 시간 이후에 인증할 수 있어요.');
    return;
  }
  if (alreadyVerified.value) {
    toast.error('이미 인증한 모임이에요.');
    return;
  }
  if (!compressedFile.value) {
    toast.error('인증 사진을 먼저 촬영하세요.');
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

    clearPreviewUrl();
    compressedFile.value = null;
    originalSize.value = 0;
    status.value = '';
    toast.success('인증이 완료되었습니다. +10점');
    triggerSuccessEffect();
    await loadMyVerifications();
  } catch (error) {
    toast.error(error.message);
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
</script>

<template>
  <section class="grid gap-5">
    <div class="mb-1 pr-32">
      <h1 class="text-[22px] font-bold leading-snug text-[#333333]">출석 인증</h1>
      <p class="mt-1 text-[14px] text-[#5f6368]">모임 현장 사진을 업로드하세요</p>
    </div>

    <section class="surface-card">
      <div class="mb-5 flex items-center gap-2">
        <Camera :size="18" class="text-[#03C75A]" />
        <h2 class="text-lg font-semibold text-[#333333]">사진 인증</h2>
      </div>

      <!-- 비호스트: 인증 안내 + 참여 모임 목록 -->
      <div v-if="hostMeetups.length === 0" class="space-y-4 py-2">
        <div class="rounded-xl border border-[#dadce0] bg-[#f5f6f7] p-4">
          <div class="mb-2 flex items-center gap-2">
            <Camera :size="15" class="text-[#03C75A]" />
            <p class="text-[13px] font-bold text-[#03C75A]">인증 시스템 안내</p>
          </div>
          <p class="text-[13px] leading-relaxed text-[#333333]">
            호스트가 모임 현장 사진을 업로드하여 출석을 인증합니다.
            인증이 완료되면 <strong>10포인트</strong>가 지급됩니다.
          </p>
          <p class="mt-2 text-[12px] text-[#5f6368]">
            정기모임 5회 이상 참여 시 호스트 권한을 받을 수 있어요.
          </p>
        </div>

        <div v-if="joinedMeetups.length > 0">
          <p class="mb-2 text-[13px] font-semibold text-[#333333]">내가 참여한 모임</p>
          <ul class="grid gap-2">
            <li
              v-for="meetup in joinedMeetups"
              :key="meetup.id"
              class="rounded-lg border border-[#dadce0] bg-[#f5f6f7] p-3"
            >
              <p class="text-[14px] font-semibold text-[#333333]">{{ meetup.title }}</p>
              <p class="mt-0.5 text-[12px] text-[#5f6368]">{{ formatDate(meetup.scheduledAt) }}</p>
              <div class="mt-1 flex items-center gap-1.5">
                <MapPin :size="16" class="shrink-0 text-[#5f6368]" />
                <span class="text-[12px] text-[#5f6368]">{{ meetup.location }}</span>
              </div>
            </li>
          </ul>
        </div>
        <p v-else class="text-[13px] text-[#5f6368]">
          아직 참여한 모임이 없습니다. 모임 탭에서 모임에 참여해 보세요.
        </p>
      </div>

      <!-- 호스트: 인증 폼 -->
      <template v-else>
        <p class="mb-5 text-[15px] leading-7 text-[#5f6368]">
          내가 연 모임의 현장 사진을 올려 인증하세요. 모임 시작 시간 이후에 가능하고,
          원본 대신 압축본만 업로드합니다.
        </p>

        <label class="mb-1 grid gap-2 text-sm font-semibold text-[#333333]">
          내가 연 모임
          <select
            v-model="selectedMeetupId"
            class="h-12 rounded-lg border border-[#dadce0] bg-white px-4 text-[15px] font-medium outline-none transition focus:border-[#03C75A]"
          >
            <option value="" disabled>모임을 선택하세요</option>
            <option v-for="meetup in hostMeetups" :key="meetup.id" :value="meetup.id">
              {{ meetup.title }}
            </option>
          </select>
        </label>

        <p v-if="gateMessage" class="mb-4 mt-1 text-sm font-semibold text-[#5f6368]">{{ gateMessage }}</p>
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
          class="focus-ring mb-4 w-full overflow-hidden rounded-xl border-2 border-dashed border-[#dadce0] transition hover:border-[#03C75A] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="!canVerify"
          @click="openCamera"
        >
          <div v-if="previewUrl" class="relative">
            <img class="block max-h-[200px] w-full object-contain" :src="previewUrl" alt="선택한 사진 미리보기" />
            <div class="absolute inset-0 flex items-center justify-center bg-[#333333]/40 opacity-0 transition hover:opacity-100">
              <p class="text-[14px] font-semibold text-white">다시 선택</p>
            </div>
          </div>
          <div v-else class="flex flex-col items-center gap-2 py-10">
            <Camera :size="32" class="text-[#5f6368]" />
            <p class="text-[14px] font-medium text-[#333333]">사진을 선택하세요</p>
            <p class="text-[12px] text-[#5f6368]">최대 1600px 자동 압축</p>
          </div>
        </button>

        <button
          class="focus-ring flex h-12 w-full items-center justify-center rounded bg-[#03C75A] text-[15px] font-semibold text-white transition hover:bg-[#02b350] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          :disabled="submitting || !compressedFile || !canVerify"
          @click="submitVerification"
        >
          인증 제출
        </button>

        <div v-if="showSuccessEffect" class="success-burst" aria-hidden="true">
          <span v-for="index in 12" :key="index" />
        </div>

        <div v-if="status || showSuccessEffect" class="mt-4 rounded-xl border border-[#dadce0] bg-[#f5f6f7] p-4">
          <p v-if="status" class="text-sm font-semibold text-[#03C75A]">{{ status }}</p>
          <p v-if="showSuccessEffect" class="mt-1 text-2xl font-bold text-[#333333]">+10 포인트</p>
        </div>
      </template>
    </section>

    <section v-if="previewUrl" class="surface-card">
      <div class="mb-5 flex items-center gap-2">
        <ImageIcon :size="18" class="text-[#03C75A]" />
        <h2 class="text-lg font-semibold text-[#333333]">압축 정보</h2>
      </div>

      <dl class="grid grid-cols-3 gap-3">
        <div class="rounded-lg border border-[#dadce0] bg-[#f5f6f7] p-4">
          <dt class="text-sm font-semibold text-[#5f6368]">원본</dt>
          <dd class="mt-1 text-base font-bold text-[#333333]">{{ formatBytes(originalSize) }}</dd>
        </div>
        <div class="rounded-lg border border-[#dadce0] bg-[#f5f6f7] p-4">
          <dt class="text-sm font-semibold text-[#5f6368]">압축본</dt>
          <dd class="mt-1 text-base font-bold text-[#333333]">{{ formatBytes(compressedSize) }}</dd>
        </div>
        <div class="rounded-lg border border-[#dadce0] bg-[#f5f6f7] p-4">
          <dt class="text-sm font-semibold text-[#5f6368]">절감</dt>
          <dd class="mt-1 text-base font-bold text-[#333333]">{{ compressionRatio || '-' }}</dd>
        </div>
      </dl>
    </section>

    <section class="surface-card">
      <div class="mb-5 flex items-center gap-2">
        <History :size="18" class="text-[#03C75A]" />
        <h2 class="text-lg font-semibold text-[#333333]">인증 내역</h2>
      </div>

      <p v-if="myVerifications.length === 0" class="py-6 text-[15px] text-[#5f6368]">
        아직 인증한 모임이 없어요.
      </p>
      <ul v-else class="grid gap-3">
        <li
          v-for="verification in myVerifications"
          :key="verification.id"
          class="flex items-center gap-3 rounded-lg border border-[#dadce0] bg-[#f5f6f7] p-3"
        >
          <img
            v-if="verification.photoViewUrl"
            :src="verification.photoViewUrl"
            class="h-14 w-14 shrink-0 rounded-lg object-cover"
            alt="인증 사진"
          />
          <div
            v-else
            class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#dadce0] text-[#5f6368]"
          >
            <ImageIcon :size="18" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[15px] font-semibold text-[#333333]">{{ verification.meetupTitle }}</p>
            <p class="mt-0.5 text-sm font-medium text-[#5f6368]">{{ formatDate(verification.createdAt) }}</p>
          </div>
          <strong class="shrink-0 text-sm font-bold text-[#03C75A]">+{{ verification.pointsAwarded }}</strong>
        </li>
      </ul>
    </section>
  </section>
</template>
