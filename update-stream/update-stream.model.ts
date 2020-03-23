import { Cursor } from 'mongodb';
import { ResponseSse } from '../../interfaces';
import { MarketUpdateModel } from '../market-updates';
import { SportEventUpdateModel } from '../sport-event-updates';

export interface BetslipStorageRecord {
  listeners: ResponseSse[];
  eventUpdateStream: Cursor<SportEventUpdateModel>;
  marketUpdateStream: Cursor<MarketUpdateModel>;
  intervalFunc?: NodeJS.Timeout;
}

export interface UpdateBetslipStorage {
  [customerId: number]: BetslipStorageRecord;
}

export interface BetslipEntityIds {
  eventIds: string[];
  marketIds: string[];
  selectionIds: string[];
}
