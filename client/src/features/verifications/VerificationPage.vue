<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Camera, Clock3, History, Image as ImageIcon } from '@lucide/vue';
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

const verifiableMeetups = computed(() =>
  [...meetups.value]
    .filter((meetup) => meetup.joined || meetup.isHost)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
);

const selectedMeetup = computed(
  () => verifiableMeetups.value.find((meetup) => meetup.id === selectedMeetupId.value) ?? null,
);
const verifiedIds = computed(() => new Set(myVerifications.value.map((v) => v.meetupId)));
const pendingMeetups = computed(() =>
  verifiableMeetups.value.filter((meetup) => !verifiedIds.value.has(meetup.id)),
);
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
  // 인증 대기 목록(v-for) 안에서 렌더되므로 ref가 배열로 잡힐 수 있다.
  const el = Array.isArray(photoInput.value) ? photoInput.value[0] : photoInput.value;
  el?.click();
}

function selectPendingMeetup(meetup) {
  // 같은 카드를 다시 누르면 접고, 다른 카드로 옮기면 이전에 고른 사진을 버린다
  // (A 모임에 찍은 사진이 B 모임 제출에 남아 있으면 안 된다).
  const collapsing = selectedMeetupId.value === meetup.id;
  selectedMeetupId.value = collapsing ? '' : meetup.id;
  resetPhoto();
  status.value = '';
}

function pendingStatusLabel(meetup) {
  return meetup.state === 'done' ? '인증 가능' : '시작 전';
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
    </div>

    <!-- 사진 인증: 안내만. 실제 촬영·제출은 아래 '인증 대기' 카드에서 한다. -->
    <section class="surface-card">
      <div class="mb-5 flex items-center gap-2">
        <Camera :size="18" class="text-[#03C75A]" />
        <h2 class="text-lg font-semibold text-[#333333]">사진 인증</h2>
      </div>

      <div class="rounded-xl border border-[#dadce0] bg-[#f5f6f7] p-4">
        <div class="mb-2 flex items-center gap-2">
          <Camera :size="15" class="text-[#03C75A]" />
          <p class="text-[13px] font-bold text-[#03C75A]">인증 시스템 안내</p>
        </div>
        <p class="text-[13px] leading-relaxed text-[#333333]">
          참여한 모임의 현장 사진을 업로드하여 출석을 인증합니다.
          인증이 완료되면 <strong>10포인트</strong>가 지급됩니다.
          모임 시작 시간 이후에 아래 <strong>인증 대기</strong>에서 모임을 눌러 인증하세요.
        </p>
      </div>

      <p v-if="verifiableMeetups.length === 0" class="mt-4 text-[13px] text-[#5f6368]">
        아직 인증할 수 있는 참여 모임이 없습니다.
      </p>

      <!-- 인증 성공 효과. 인증하면 그 모임이 pendingMeetups에서 빠져 아래 카드가
           언마운트되므로, 효과는 항상 렌더되는 이 섹션에 둬야 보인다. -->
      <div v-if="showSuccessEffect" class="success-burst" aria-hidden="true">
        <span v-for="index in 12" :key="index" />
      </div>

      <div
        v-if="showSuccessEffect"
        class="mt-4 rounded-xl border border-[#03C75A] bg-[#e9f8ef] p-4 text-center"
      >
        <p class="text-sm font-semibold text-[#03883f]">인증이 완료됐어요.</p>
        <p class="mt-1 text-2xl font-bold text-[#333333]">+10 포인트</p>
      </div>
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

    <section v-if="verifiableMeetups.length > 0" class="surface-card">
      <div class="mb-5 flex items-center gap-2">
        <Clock3 :size="18" class="text-[#03C75A]" />
        <h2 class="text-lg font-semibold text-[#333333]">인증 대기</h2>
      </div>

      <p v-if="pendingMeetups.length === 0" class="py-4 text-[15px] text-[#5f6368]">
        대기 중인 모임이 없어요.
      </p>
      <ul v-else class="grid gap-2">
        <li v-for="meetup in pendingMeetups" :key="meetup.id">
          <button
            class="focus-ring flex w-full items-center gap-3 rounded-lg border p-3 text-left transition hover:bg-[#f5f6f7]"
            :class="
              meetup.id === selectedMeetupId
                ? 'border-[#03C75A] bg-[#e9f8ef]'
                : 'border-[#dadce0] bg-[#f5f6f7]'
            "
            type="button"
            @click="selectPendingMeetup(meetup)"
          >
            <span
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#03C75A]"
            >
              <Camera :size="17" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[14px] font-semibold text-[#333333]">{{ meetup.title }}</span>
              <span class="mt-0.5 block text-[12px] text-[#5f6368]">{{ formatDate(meetup.scheduledAt) }}</span>
            </span>
            <span
              class="shrink-0 rounded-full px-2 py-1 text-[12px] font-semibold"
              :class="
                meetup.state === 'done'
                  ? 'bg-[#e9f8ef] text-[#03883f]'
                  : 'bg-white text-[#5f6368]'
              "
            >
              {{ pendingStatusLabel(meetup) }}
            </span>
          </button>

          <!-- 선택한 카드 아래에서 그 자리서 인증을 진행한다 -->
          <div
            v-if="meetup.id === selectedMeetupId"
            class="mt-2 rounded-lg border border-[#dadce0] bg-white p-4"
          >
            <p v-if="gateMessage" class="text-sm font-semibold text-[#5f6368]">{{ gateMessage }}</p>

            <template v-if="canVerify">
              <input
                ref="photoInput"
                class="visually-hidden"
                type="file"
                accept="image/*"
                capture="environment"
                @change="handlePhotoChange"
              />

              <div class="mb-3 grid gap-3">
                <div
                  class="flex min-h-[148px] items-center justify-center overflow-hidden rounded-xl border border-[#dadce0] bg-[#f5f6f7]"
                >
                  <img
                    v-if="previewUrl"
                    class="block max-h-[220px] w-full object-contain"
                    :src="previewUrl"
                    alt="선택한 사진 미리보기"
                  />
                  <div v-else class="flex flex-col items-center gap-2 py-8 text-[#5f6368]">
                    <ImageIcon :size="28" />
                    <p class="text-[13px] font-medium">사진을 찍으면 미리보기가 표시됩니다.</p>
                    <p class="text-[12px]">최대 1600px 자동 압축</p>
                  </div>
                </div>

                <button
                  class="focus-ring flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#dadce0] bg-white text-[15px] font-semibold text-[#333333] transition hover:bg-[#f5f6f7]"
                  type="button"
                  @click="openCamera"
                >
                  <Camera :size="18" />
                  {{ previewUrl ? '사진 다시 찍기' : '사진 찍기' }}
                </button>
              </div>

              <button
                class="focus-ring flex h-12 w-full items-center justify-center rounded bg-[#03C75A] text-[15px] font-semibold text-white transition hover:bg-[#02b350] disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                :disabled="submitting || !compressedFile"
                @click="submitVerification"
              >
                인증 제출
              </button>

              <!-- 업로드 중 상태. 성공하면 status가 비고 카드 자체가 사라지므로
                   (인증된 모임은 pendingMeetups에서 빠짐) 여기엔 진행 상태만 뜬다.
                   성공 효과는 위 '사진 인증' 섹션에 있다. -->
              <p v-if="status" class="mt-3 text-center text-sm font-semibold text-[#03C75A]">
                {{ status }}
              </p>
            </template>
          </div>
        </li>
      </ul>
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
