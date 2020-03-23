import { Injectable } from '@nestjs/common';
import { LoggerService } from '@sportsbook-bff/logger';
import { mergeUpdatedEntities } from '@sportsbook/shared_components_be';
import { ANONYMOUS_CUSTOMER_ID } from '../../constants';
import { ResponseSse } from '../../interfaces';
import { AerospikeService } from '../aerospike';
import { MARKET_UPDATE_PROJECTION, MarketUpdateModel, MarketUpdateService } from '../market-updates';
import { SelectionEntitiesId, SelectionService, SelectionWithEventAndMarketModel } from '../selection';
import { SPORT_EVENT_UPDATE_PROJECTION, SportEventUpdateModel, SportEventUpdatesService } from '../sport-event-updates';
import { UpdateStreamService } from '../update-stream';
import {
  BetslipASRecord,
  BetslipUpdateResponse,
  PostBetslipRequestModel,
  PostBetslipResponseModel,
} from './models/api';
import { getLongNow } from '../../utils';
import { CurrencyService } from '../currency';

@Injectable()
export class BetslipService {
  public setName: string;

  constructor(
    private readonly log: LoggerService,
    private aerospikeService: AerospikeService,
    private selectionService: SelectionService,
    private sportEventUpdateService: SportEventUpdatesService,
    private marketUpdateService: MarketUpdateService,
    private updateStreamService: UpdateStreamService,
    private currencyService: CurrencyService,
  ) {
    this.setName = 'betslip';
    this.log.silly('CREATED BetslipService');
  }

  public async getBetslipRecordsFromAerospike(customerId: number): Promise<BetslipASRecord | null> {
    const key = this.getBetslipKey(customerId);

    return this.aerospikeService.getRecord<BetslipASRecord>(key);
  }

  public async getMyBetslip(customerId: number): Promise<SelectionWithEventAndMarketModel[]> {
    this.log.debug(`got request to get betslip for ${customerId}`);
    const betslip = await this.getBetslipRecordsFromAerospike(customerId);
    this.log.debug(`got ${JSON.stringify(betslip)} betslip record for ${customerId}`);

    return betslip && betslip.selectionIds.length
      ? this.selectionService.getSelectionsPopulatedWithMarketAndEvent(betslip.selectionIds)
      : [];
  }

  public async getAnonymousBetslip(selectionsIds: string[]): Promise<SelectionWithEventAndMarketModel[]> {
    this.log.debug(`got request to get betslip for anonymous user`);

    return this.selectionService.getSelectionsPopulatedWithMarketAndEvent(selectionsIds);
  }

  public async removeBetslipRecord(customerId: number): Promise<void> {
    const key = this.getBetslipKey(customerId);
    await this.updateStreamService.updateCustomerStreams(customerId, []);

    return this.aerospikeService.removeRecord(key);
  }

  public async putMyBetslip(customerId: number, payload: PostBetslipRequestModel): Promise<boolean> {
    if (customerId !== ANONYMOUS_CUSTOMER_ID) {
      this.log.debug(
        `got request to set betslip for ${customerId}, number of selections : ${payload.selectionIds.length}`,
      );
      const key = this.getBetslipKey(customerId);
      await this.aerospikeService.putRecord<BetslipASRecord>(key, payload);
      await this.updateStreamService.updateCustomerStreams(customerId, payload.selectionIds);
    }
    return true;
  }

  private async getCustomersSelections(customerId: number): Promise<SelectionEntitiesId[]> {
    const betslip = (await this.getBetslipRecordsFromAerospike(customerId)) as BetslipASRecord;
    const savedSelectionIds = betslip?.selectionIds ? betslip?.selectionIds : [];
    this.log.debug(`got ${JSON.stringify(savedSelectionIds)} betslip record for ${customerId}`);
    return savedSelectionIds.length ? this.selectionService.getSelectionsEntityIds(savedSelectionIds) : [];
  }

  public async getBetslipUpdates(customerId: number, updateTimestamp: number): Promise<BetslipUpdateResponse[]> {
    this.log.silly(`got request from ${customerId} to get updates for betslip`);
    const selections: SelectionEntitiesId[] = await this.getCustomersSelections(customerId);
    this.log.debug(`found ${selections.length} selections`);
    return Promise.all(selections.map(selection => this.getBetslipUpdateEntity(selection, updateTimestamp)));
  }

  public async getBetslipUpdatesForAnonymous(
    selectionIdArr: string[],
    updateTimestamp: number,
  ): Promise<BetslipUpdateResponse[]> {
    this.log.silly(`getBetslipUpdatesForAnonymous called with ids: ${JSON.stringify(selectionIdArr)}`);
    const selections: SelectionEntitiesId[] = await this.selectionService.getSelectionsEntityIds(selectionIdArr);
    return Promise.all(selections.map(selection => this.getBetslipUpdateEntity(selection, updateTimestamp)));
  }

  public async getStreamUpdates(customerId: number, updateTimestamp: number = getLongNow(), res: ResponseSse) {
    const selections = await this.getCustomersSelections(customerId);
    this.log.debug(`found ${selections.length} selections for customer: ${customerId}`);
    return this.updateStreamService.getBetslipUpdates(customerId, selections, updateTimestamp, res);
  }

  private getBetslipKey(customerId: number) {
    return this.aerospikeService.getKey(this.setName, customerId);
  }

  private async getBetslipUpdateEntity(
    selection: SelectionEntitiesId,
    timeStamp: number,
  ): Promise<BetslipUpdateResponse> {
    const [eventUpdates, marketUpdates] = await Promise.all([
      this.sportEventUpdateService.findAll<SportEventUpdateModel>(
        {
          'Reference.EntityId': selection.EventId,
          TimeStamp: { $gt: timeStamp },
        },
        { sort: { $natural: 1 }, projection: SPORT_EVENT_UPDATE_PROJECTION },
      ),
      this.marketUpdateService.findAll<MarketUpdateModel>(
        {
          'Reference.EntityId': selection.MarketId,
          TimeStamp: { $gt: timeStamp },
        },
        { sort: { $natural: 1 }, projection: MARKET_UPDATE_PROJECTION },
      ),
    ]);
    const [updatedEventObject] = mergeUpdatedEntities(eventUpdates) as SportEventUpdateModel[];
    const [updatedMarketObject] = mergeUpdatedEntities(
      this.marketUpdateService.filterMarketsSelections(marketUpdates, selection._id),
    ) as MarketUpdateModel[];
    const event = updatedEventObject
      ? {
          Changeset: updatedEventObject.Changeset,
          TimeStamp: updatedEventObject.TimeStamp,
          Operation: updatedEventObject.Operation,
        }
      : updatedEventObject;

    let market;
    if (updatedMarketObject) {
      market = {
        Changeset: updatedMarketObject.Changeset,
        TimeStamp: updatedMarketObject.TimeStamp,
        Operation: updatedMarketObject.Operation,
      };
    }
    return { market, event, selectionId: selection._id };
  }

  public async clearAll(customerId: number, token: string): Promise<boolean> {
    this.log.debug(`get request to delete all betslips from customer: ${customerId}`);
    const key = this.getBetslipKey(customerId);
    await this.aerospikeService.removeRecord(key);
    this.log.debug(`all records from aerospike was successfully deleted`);
    return true;
  }

  public async setCustomerBetslip(
    payload: PostBetslipRequestModel,
    customerId: number,
    currCode: string,
  ): Promise<PostBetslipResponseModel> {
    payload.selectionIds && payload.selectionIds.length
      ? await this.putMyBetslip(customerId, payload)
      : await this.removeBetslipRecord(customerId);
    const curRec = await this.currencyService.getCurrency(currCode);
    return { currencyRate: curRec.currencyRate };
  }
}
