import { Injectable } from '@nestjs/common';
import { LoggerService } from '@sportsbook-bff/logger';
import { mergeUpdatedEntities } from '@sportsbook/shared_components_be';
import { Cursor } from 'mongodb';
import { ResponseSse } from '../../interfaces';
import { BetslipUpdateResponse } from '../betslip/models/api';
import { MARKET_UPDATE_PROJECTION, MarketUpdateModel, MarketUpdateService } from '../market-updates';
import { SelectionEntitiesId, SelectionService } from '../selection';
import { SPORT_EVENT_UPDATE_PROJECTION, SportEventUpdateModel, SportEventUpdatesService } from '../sport-event-updates';
import { BetslipEntityIds, BetslipStorageRecord, UpdateBetslipStorage } from './update-stream.model';
import { getLongNow } from '../../utils';

@Injectable()
export class UpdateStreamService {
  private readonly updateBetslipStorage: UpdateBetslipStorage;

  constructor(
    private sportEventUpdateService: SportEventUpdatesService,
    private marketUpdateService: MarketUpdateService,
    private selectionService: SelectionService,
    private log: LoggerService,
  ) {
    this.updateBetslipStorage = {};
  }

  public async createBetslipUpdateRecord(
    customerId: number,
    selections: SelectionEntitiesId[],
    timeStamp: number,
  ): Promise<void> {
    this.log.debug(`begin to create stream for customer ${customerId}`);
    this.log.debug(`timestamp: ${timeStamp}`);
    const entitiesIds = this.getIdsFromSelections(selections);
    const [eventUpdateStream, marketUpdateStream] = await Promise.all([
      this.getEventUpdateStream(entitiesIds.eventIds, timeStamp),
      this.getMarketUpdatesStream(entitiesIds.marketIds, timeStamp),
    ]);
    Object.assign(this.updateBetslipStorage[customerId], { eventUpdateStream, marketUpdateStream });
    this.proceedBetslipUpdates(customerId, this.updateBetslipStorage[customerId], selections).catch((error: Error) => {
      this.log.error(`got error on proceedBetslipUpdates: ${error.message}`);
    });
  }

  public async getEventUpdateStream(eventIds: string[], timestamp: number): Promise<Cursor<SportEventUpdateModel>> {
    const sportEventUpdateCollection = await this.sportEventUpdateService.getCollection<SportEventUpdateModel>();

    return sportEventUpdateCollection
      .find(
        {
          'Reference.EntityId': { $in: eventIds },
          TimeStamp: { $gt: timestamp },
        },
        { projection: SPORT_EVENT_UPDATE_PROJECTION },
      )
      .addCursorFlag('tailable', true)
      .addCursorFlag('awaitData', true);
  }

  public async getMarketUpdatesStream(marketIds: string[], timestamp: number): Promise<Cursor<MarketUpdateModel>> {
    const marketUpdateCollection = await this.marketUpdateService.getCollection<MarketUpdateModel>();

    return marketUpdateCollection
      .find(
        {
          'Reference.EntityId': { $in: marketIds },
          TimeStamp: { $gt: timestamp },
        },
        { projection: MARKET_UPDATE_PROJECTION },
      )
      .addCursorFlag('tailable', true)
      .addCursorFlag('awaitData', true);
  }

  public async proceedBetslipUpdates(
    customerId: number,
    betslipUpdateStorage: BetslipStorageRecord,
    selections: SelectionEntitiesId[],
  ): Promise<void> {
    let eventUpdates: SportEventUpdateModel[] = [];
    let marketUpdates: MarketUpdateModel[] = [];
    betslipUpdateStorage.eventUpdateStream.on('data', eventUpdate => eventUpdates.push(eventUpdate));
    betslipUpdateStorage.marketUpdateStream.on('data', marketUpdate => marketUpdates.push(marketUpdate));

    const sendMessage = () => {
      const mergedEventUpdates = mergeUpdatedEntities(eventUpdates).filter(
        (eventUpdate: SportEventUpdateModel) => Object.keys(eventUpdate.Changeset).length,
      );

      const mergedMarketUpdates = mergeUpdatedEntities(marketUpdates).filter(
        (eventUpdate: MarketUpdateModel) => Object.keys(eventUpdate.Changeset).length,
      );

      eventUpdates = [];
      marketUpdates = [];
      if (!mergedEventUpdates.length && !mergedMarketUpdates.length) {
        return;
      }
      const selectionObj = selections.reduce(
        (res, cur) => {
          res.events[cur.EventId] = cur._id;
          res.markets[cur.MarketId] = cur._id;

          return res;
        },
        { events: {}, markets: {} },
      );
      const { events, markets } = selectionObj;
      const mergedEventObj = mergedEventUpdates.reduce(
        (res: { [eventId: string]: number }, cur: SportEventUpdateModel, index: number) => {
          res[events[cur.Reference.EntityId]] = index;

          return res;
        },
        {},
      );
      const mergedMarketObj = mergedMarketUpdates.reduce(
        (res: { [marketId: string]: number }, cur: MarketUpdateModel, index: number) => {
          res[markets[cur.Reference.EntityId]] = index;

          return res;
        },
        {},
      );
      const message: BetslipUpdateResponse[] = selections.reduce(
        (resultMessage: BetslipUpdateResponse[], selection: SelectionEntitiesId) => {
          const updateRecord: BetslipUpdateResponse = { selectionId: selection._id };
          if (typeof mergedEventObj[selection._id] !== 'undefined') {
            const event = mergedEventUpdates[mergedEventObj[selection._id]];
            // @ts-ignore
            updateRecord.event = { Changeset: event.Changeset, TimeStamp: event.TimeStamp, Operation: event.Operation };
          }
          if (typeof mergedMarketObj[selection._id] !== 'undefined') {
            const market = this.marketUpdateService.filterSingleMarketSelections(
              mergedMarketUpdates[mergedMarketObj[selection._id]] as MarketUpdateModel,
              selection._id,
            );
            updateRecord.market = {
              Changeset: market.Changeset,
              TimeStamp: market.TimeStamp,
              Operation: market.Operation,
            };
          }
          resultMessage.push(updateRecord);

          return resultMessage;
        },
        [],
      );
      betslipUpdateStorage.listeners.forEach((listener, index) => {
        listener.sse(message);
      });
    };

    betslipUpdateStorage.intervalFunc = setInterval(() => {
      if (eventUpdates.length || marketUpdates.length) {
        this.log.silly(`for customer ${customerId} we have ${betslipUpdateStorage.listeners.length} listeners`);
        this.log.debug(
          `for customer ${customerId} we have ${eventUpdates.length} event updates and ${marketUpdates.length} market updates`,
        );
        sendMessage();
      }
    }, 1000);
  }

  public async getBetslipUpdates(
    customerId: number,
    selections: SelectionEntitiesId[],
    timestamp: number,
    stream: ResponseSse,
  ): Promise<void> {
    this.log.debug(`got request getBetslipUpdates for customer: ${customerId}, request.id: ${stream.id}`);
    stream.on('close', () => {
      this.log.debug(`customer ${customerId} close request: ${stream.id}`);
      cleanupListeners(stream);
    });
    stream.on('error', (err: Error) => {
      this.log.error(`customer ${customerId} got error: ${err.message} and will be closed`);
      cleanupListeners(stream);
    });
    stream.on('finish', (err: Error) => {
      this.log.debug(`customer ${customerId} has finish connection: ${stream.id}`);
      cleanupListeners(stream);
    });
    const cleanupListeners = async (stream: ResponseSse) => {
      if (!this.updateBetslipStorage[customerId]) {
        return;
      }
      this.updateBetslipStorage[customerId].listeners = this.updateBetslipStorage[customerId].listeners.filter(
        listener => listener.id !== stream.id,
      );
      this.log.debug(`${this.updateBetslipStorage[customerId]?.listeners?.length || 0} listeners left`);
      if (!this.updateBetslipStorage[customerId]?.listeners?.length) {
        await this.deleteCustomerUpdateStorageRecord(customerId);
      }
    };
    return this.getBetslipStorageRecord(customerId, selections, stream, timestamp);
  }

  public async updateCustomerStreams(customerId: number, selectionIds: string[]): Promise<void> {
    if (!this.updateBetslipStorage[customerId]) {
      return;
    }
    const listeners = this.updateBetslipStorage[customerId].listeners;
    const selections = await this.selectionService.getSelectionsEntityIds(selectionIds);
    await this.deleteCustomerUpdateStorageRecord(customerId);
    for (const listener of listeners) {
      this.log.silly(`add listener for ${listener.id}`);
      await this.getBetslipStorageRecord(customerId, selections, listener, getLongNow()).catch(err =>
        this.log.error(`updateCustomerStreams got error: ${err.message}`),
      );
    }
  }

  private async deleteCustomerUpdateStorageRecord(customerId: number): Promise<void> {
    clearInterval(this.updateBetslipStorage[customerId].intervalFunc as NodeJS.Timeout);
    const closeArr = [];
    try {
      if (this.updateBetslipStorage[customerId]?.marketUpdateStream) {
        closeArr.push(this.updateBetslipStorage[customerId].marketUpdateStream.close());
      }
      if (this.updateBetslipStorage[customerId]?.eventUpdateStream) {
        closeArr.push(this.updateBetslipStorage[customerId].eventUpdateStream.close());
      }
      delete this.updateBetslipStorage[customerId];
      await Promise.all(closeArr);
    } catch (e) {
      this.log.error(`deleteCustomerUpdateStorageRecord got error: ${e.message}`);
    }
  }

  private async getBetslipStorageRecord(
    customerId: number,
    selections: SelectionEntitiesId[],
    stream: ResponseSse,
    timestamp: number,
  ) {
    if (this.updateBetslipStorage[customerId]) {
      this.log.debug(`update stream for customer ${customerId} already exists`);
      this.updateBetslipStorage[customerId].listeners.push(stream);
      return;
    }
    this.log.debug(`no update stream for customer ${customerId} was found`);
    this.updateBetslipStorage[customerId] = {
      listeners: [stream],
    } as BetslipStorageRecord;
    return this.createBetslipUpdateRecord(customerId, selections, timestamp);
  }

  private getIdsFromSelections(selections: SelectionEntitiesId[]): BetslipEntityIds {
    return selections.reduce(
      (res: BetslipEntityIds, cur) => {
        res.marketIds.push(cur.MarketId);
        res.eventIds.push(cur.EventId);
        res.selectionIds.push(cur._id);

        return res;
      },
      { eventIds: [], marketIds: [], selectionIds: [] },
    );
  }
}
