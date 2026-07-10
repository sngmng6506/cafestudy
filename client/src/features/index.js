import { Award, CalendarDays, Camera, Coffee, Dices, History, Home, QrCode, SearchCheck, Trophy, Users } from '@lucide/vue';
import HomePage from './home/HomePage.vue';
import MeetupPage from './meetups/MeetupPage.vue';
import RankingPage from './ranking/RankingPage.vue';
import VerificationPage from './verifications/VerificationPage.vue';
import DicePage from './dice/DicePage.vue';
import MembersPage from './members/MembersPage.vue';
import CafesPage from './cafes/CafesPage.vue';
import UpdatesPage from './updates/UpdatesPage.vue';
import MeetupHistoryPage from './history/MeetupHistoryPage.vue';
import BadgesPage from './badges/BadgesPage.vue';
import QrPage from './qr/QrPage.vue';
import SearchGuidePage from './menu-search/SearchGuidePage.vue';

// `primary: true` pins a feature to the bottom tab bar. Features without it
// (extra/non-core features contributors add later) collect in the "더보기" sheet,
// so core navigation never gets crowded out as features grow.
export const features = [
  {
    name: 'home',
    label: '홈',
    order: 0,
    icon: Home,
    component: HomePage,
    primary: true,
  },
  {
    name: 'meetups',
    label: '모임',
    order: 10,
    icon: CalendarDays,
    component: MeetupPage,
    primary: true,
  },
  {
    name: 'verifications',
    label: '인증',
    order: 20,
    icon: Camera,
    component: VerificationPage,
    primary: true,
  },
  {
    name: 'ranking',
    label: '랭킹',
    order: 30,
    icon: Trophy,
    component: RankingPage,
    primary: true,
  },
  {
    name: 'members',
    label: '멤버',
    order: 40,
    icon: Users,
    component: MembersPage,
    primary: true,
  },
  {
    name: 'dice',
    label: '주사위',
    order: 100,
    icon: Dices,
    component: DicePage,
  },
  {
    name: 'badges',
    label: '뱃지',
    order: 105,
    icon: Award,
    component: BadgesPage,
  },
  {
    name: 'cafes',
    label: '카페 정보',
    order: 110,
    icon: Coffee,
    component: CafesPage,
  },
  {
    name: 'meetup-history',
    label: '모임 이력',
    order: 115,
    icon: CalendarDays,
    component: MeetupHistoryPage,
  },
  {
    name: 'updates',
    label: '알려진 이슈',
    order: 120,
    icon: History,
    component: UpdatesPage,
  },
  {
    name: 'search-guide',
    label: '검색 안내',
    order: 123,
    icon: SearchCheck,
    component: SearchGuidePage,
  },
  {
    name: 'qr',
    label: '접속 QR',
    order: 125,
    icon: QrCode,
    component: QrPage,
  },
];
