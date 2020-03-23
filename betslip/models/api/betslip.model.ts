import { ApiProperty } from '@nestjs/swagger';

export class BetslipASRecord {
  @ApiProperty({ type: [String] })
  public selectionIds: string[];
}
