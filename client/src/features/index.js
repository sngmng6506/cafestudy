import { CalendarDays, Camera, Dices, Home, Trophy, Users } from '@lucide/vue';
import HomePage from './home/HomePage.vue';
import MeetupPage from './meetups/MeetupPage.vue';
import RankingPage from './ranking/RankingPage.vue';
import VerificationPage from './verifications/VerificationPage.vue';
import DicePage from './dice/DicePage.vue';
import MembersPage from './members/MembersPage.vue';

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
];
