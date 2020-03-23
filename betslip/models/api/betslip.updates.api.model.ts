import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SportEventUpdateResponse } from '../../../sport-event-updates';
import { MarketUpdateResponse } from '../../../market-updates';

export class BetslipUpdateResponse {
  @ApiProperty()
  public selectionId: string;

  @ApiPropertyOptional({ type: MarketUpdateResponse })
  public market?: MarketUpdateResponse;

  @ApiPropertyOptional({ type: SportEventUpdateResponse })
  public event?: SportEventUpdateResponse;
}
