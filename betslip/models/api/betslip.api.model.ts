import { SelectionWithEventAndMarketModel } from '../../../selection';
import { BetslipASRecord } from './betslip.model';
import { ApiProperty } from '@nestjs/swagger';

export class PostBetslipRequestModel extends BetslipASRecord {}

export class PostBetslipResponseModel {
  @ApiProperty()
  currencyRate: number;
}

export class GetBetslipResponseModels extends SelectionWithEventAndMarketModel {}
