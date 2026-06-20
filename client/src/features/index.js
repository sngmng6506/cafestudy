import { CalendarDays, Camera, Home, Trophy } from '@lucide/vue';
import HomePage from './home/HomePage.vue';
import MeetupPage from './meetups/MeetupPage.vue';
import RankingPage from './ranking/RankingPage.vue';
import VerificationPage from './verifications/VerificationPage.vue';

export const features = [
  {
    name: 'home',
    label: '홈',
    order: 0,
    icon: Home,
    component: HomePage,
  },
  {
    name: 'meetups',
    label: '모임',
    order: 10,
    icon: CalendarDays,
    component: MeetupPage,
  },
  {
    name: 'verifications',
    label: '인증',
    order: 20,
    icon: Camera,
    component: VerificationPage,
  },
  {
    name: 'ranking',
    label: '랭킹',
    order: 30,
    icon: Trophy,
    component: RankingPage,
  },
];
