import type { HomeOrder, HomeRangeDays } from './homeDates';

export const RANGE_LABEL_KEYS: Record<HomeRangeDays, string> = {
  3: 'home.range3',
  7: 'home.range7',
  30: 'home.range30',
};

export const RANGE_SHORT_KEYS: Record<HomeRangeDays, string> = {
  3: 'home.rangeShort3',
  7: 'home.rangeShort7',
  30: 'home.rangeShort30',
};

export const ORDER_LABEL_KEYS: Record<HomeOrder, string> = {
  newest: 'home.orderNewest',
  oldest: 'home.orderOldest',
};
